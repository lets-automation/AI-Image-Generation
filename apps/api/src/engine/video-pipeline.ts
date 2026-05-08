/**
 * Video Generation Pipeline (Seedance 2.0 / BytePlus ModelArk).
 *
 * Orchestrates the full image-to-video flow for a single Generation row:
 *   1. Load + validate the Generation
 *   2. Resolve the source image URL (template or user upload)
 *   3. Submit one Seedance task per native clip (15 s each)
 *      - For 30 s outputs: clip 2 is conditioned on the last frame of clip 1
 *      - Last-frame extraction → temp Cloudinary upload → URL → next clip
 *   4. Concatenate clips with ffmpeg (stream-copy, falls back to re-encode)
 *   5. Upload final mp4 to Cloudinary as a video asset
 *   6. Mark Generation COMPLETED with resultVideoUrl
 *
 * Failure path: mark FAILED, refund credits via subscriptionService,
 * cancel any in-flight Seedance task, delete intermediate frame uploads.
 *
 * Status updates are published to the same Redis channel pattern the SSE
 * endpoint already subscribes to (`generation:${id}:status`), so the
 * frontend can use the existing /generations/:id/status SSE for both
 * image and video generations.
 */

import { prisma } from "../config/database.js";
import { getRedis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { AppError, BadRequestError, NotFoundError } from "../utils/errors.js";
import { subscriptionService } from "../services/subscription.service.js";
import {
  SEEDANCE_MAX_NATIVE_DURATION_SEC,
  SEEDANCE_TIER_MAP,
  VIDEO_JOB_TIMEOUT_MS,
  type QualityTier,
  type VideoDuration,
} from "@ep/shared";

import { seedanceProvider } from "./providers/seedance.js";
import {
  concatClips,
  crossfadeClips,
  downloadVideo,
  extractLastFrame,
} from "./video-tools.js";
import {
  deleteFromCloudinary,
  deleteVideoFromCloudinary,
  uploadToCloudinary,
  uploadVideoToCloudinary,
} from "./upload/cloudinary.js";

export interface VideoPipelineInput {
  generationId: string;
}

export interface VideoPipelineResult {
  generationId: string;
  status: "COMPLETED" | "FAILED";
  resultVideoUrl?: string;
  resultVideoPublicId?: string;
  errorMessage?: string;
  /** Set on FAILED results so the worker can decide whether to retry. */
  errorCode?: string;
  /** Hint to the BullMQ worker — true means "do not retry this job". */
  nonRetryable?: boolean;
  processingMs: number;
}

// ─── Status helpers ─────────────────────────────────────────

async function publishStatus(
  generationId: string,
  status: string,
  progress: number,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.publish(
      `generation:${generationId}:status`,
      JSON.stringify({ status, progress, ...extra })
    );
  } catch {
    // SSE polling fallback handles this — no need to surface
  }
}

/**
 * Produce the per-clip prompt sent to Seedance.
 *
 * There are two execution paths:
 *
 * 1. Per-clip prompts provided (`userPrompts.length === totalClips`).
 *    The user authored a distinct script for each 15-second window. Each
 *    clip receives its own prompt verbatim — including clip > 0, which is
 *    sent with only the extracted last frame as conditioning (no original
 *    references; BytePlus rejects mixing first_frame with reference_image).
 *    Identity continuity comes from the lastFrame + whatever subject detail
 *    the user wrote into their clip-N prompt, plus the crossfade stitch.
 *
 * 2. Legacy single prompt (`userPrompts.length === 1` while totalClips > 1).
 *    Old clients (mobile app, scripts) that still send only `prompt`. Clip 0
 *    gets the prompt verbatim; clip > 0 falls back to a pure-continuation
 *    directive (no dialogue, no new action) so we don't reproduce the
 *    duplicate-script artifact. New clients should always send `prompts`.
 */
function buildClipPrompt(
  userPrompts: string[],
  clipIndex: number,
  totalClips: number
): string {
  // Single-clip output (15s) — always the user's first prompt verbatim.
  if (totalClips <= 1) return userPrompts[0] ?? "";

  // Path 1: per-clip prompt authored by the user — verbatim for every clip.
  if (userPrompts.length === totalClips) {
    return userPrompts[clipIndex] ?? "";
  }

  // Path 2: legacy single-prompt fallback.
  if (clipIndex === 0) return userPrompts[0] ?? "";

  // Clip > 0: pure-continuation directive (no dialogue, no new action) to
  // avoid the duplicate-script artifact. Used only when caller hasn't
  // provided per-clip prompts.
  return [
    "Continue the previous scene as a natural, seamless extension of the last frame.",
    "Maintain identical composition, lighting, color palette, mood, and camera angle.",
    "Show only subtle, continuous motion — gentle ambient movement, no scene cuts, no abrupt changes, no new actions.",
  ].join(" ");
}

// ─── Pipeline ───────────────────────────────────────────────

export async function executeVideoPipeline(
  input: VideoPipelineInput
): Promise<VideoPipelineResult> {
  const startTime = Date.now();
  const { generationId } = input;

  // Track artifacts that need cleanup on success (intermediate frames) or
  // on failure (the final video upload, if it happened before the DB write
  // failed). Populated as the pipeline progresses.
  const tempImagePublicIds: string[] = [];
  let finalVideoPublicId: string | null = null;

  // Track in-flight Seedance task ids so we can cancel them if the worker
  // is asked to abort mid-flight.
  const inFlightTaskIds: string[] = [];

  // Hard timeout via AbortController. Worker-level guard.
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, VIDEO_JOB_TIMEOUT_MS);

  // Only refund credits on the FIRST failure of a fresh attempt — never
  // double-refund on BullMQ retries of an already-FAILED generation.
  let shouldRefundOnFailure = false;

  try {
    await publishStatus(generationId, "PROCESSING", 5);

    // ─── 1. Load + validate ──────────────────────────────
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: { template: true },
    });

    if (!generation) {
      // NotFound = AppError → flagged nonRetryable in the catch block
      throw new NotFoundError(`Generation ${generationId}`);
    }
    if ((generation as { jobType?: string }).jobType !== "VIDEO") {
      throw new BadRequestError(`Generation ${generationId} is not a VIDEO job`);
    }
    if (generation.status !== "QUEUED" && generation.status !== "PROCESSING") {
      // Already in a terminal state (FAILED/COMPLETED/CANCELLED) — almost
      // always a stale BullMQ retry of a job whose row has moved on. Throwing
      // a typed BadRequestError keeps the worker from retrying again.
      throw new BadRequestError(
        `Generation ${generationId} has unexpected status: ${generation.status}`
      );
    }

    // Fresh attempt — refund only the first time we fail
    shouldRefundOnFailure = true;

    const tier = generation.qualityTier as QualityTier;
    const seedanceMapping = SEEDANCE_TIER_MAP[tier];
    if (!seedanceMapping) {
      throw new Error(`No Seedance mapping for tier ${tier}`);
    }

    const durationSec = (generation as { videoDurationSec?: number | null })
      .videoDurationSec as VideoDuration | undefined | null;
    if (!durationSec || (durationSec !== 15 && durationSec !== 30)) {
      throw new Error(
        `Invalid videoDurationSec on generation ${generationId}: ${String(durationSec)}`
      );
    }

    // Resolve source images. Multi-image is stored in providerConfig.sourceImageUrls
    // (an ordered array — first entry is the first frame, rest are references).
    // Falls back to template.imageUrl or generation.baseImageUrl for single-image
    // submissions and back-compat with rows created before multi-image support.
    //
    // Empty list is now valid — Seedance also supports text-to-video, where
    // the prompt alone drives generation.
    const generationProviderConfig =
      generation.providerConfig && typeof generation.providerConfig === "object"
        ? (generation.providerConfig as Record<string, unknown>)
        : null;
    const storedImageUrls = Array.isArray(generationProviderConfig?.sourceImageUrls)
      ? generationProviderConfig.sourceImageUrls
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : [];

    const sourceImageUrls: string[] =
      storedImageUrls.length > 0
        ? storedImageUrls
        : generation.template?.imageUrl
          ? [generation.template.imageUrl]
          : generation.baseImageUrl
            ? [generation.baseImageUrl]
            : [];

    const isTextToVideo = sourceImageUrls.length === 0;

    if (!seedanceProvider.isConfigured()) {
      throw new Error("Seedance provider is not configured (SEEDANCE_API_KEY)");
    }

    // Mark PROCESSING in DB
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: "PROCESSING" },
    });
    await publishStatus(generationId, "PROCESSING", 10);

    // ─── 2. Determine clip plan ──────────────────────────
    const clipCount = Math.ceil(durationSec / SEEDANCE_MAX_NATIVE_DURATION_SEC);
    const perClipDurationSec = SEEDANCE_MAX_NATIVE_DURATION_SEC;

    // Prefer per-clip prompts from providerConfig — set by the new wizard
    // for 30s renders so each clip gets its own user-authored script.
    // Falls back to the joined `Generation.prompt` column for legacy rows
    // that were created before per-clip prompts existed (single-prompt path).
    const storedPrompts = Array.isArray(generationProviderConfig?.prompts)
      ? generationProviderConfig.prompts.filter(
          (p): p is string => typeof p === "string" && p.trim().length > 0
        )
      : [];
    const userPrompts: string[] =
      storedPrompts.length > 0 ? storedPrompts : [generation.prompt];

    logger.info(
      {
        generationId,
        tier,
        modelId: seedanceMapping.modelId,
        resolution: seedanceMapping.resolutionLabel,
        durationSec,
        clipCount,
        isTextToVideo,
        sourceImageCount: sourceImageUrls.length,
        promptCount: userPrompts.length,
        usingPerClipPrompts: userPrompts.length === clipCount && clipCount > 1,
      },
      "Video pipeline: starting clip generation"
    );

    // ─── 3. Generate each clip ───────────────────────────
    const clipBuffers: Buffer[] = [];
    // Tracks the image URLs to send for the NEXT clip.
    //
    // For clip 0: the user's full image set (or empty for text-to-video).
    //   - 1 image  → Seedance Mode A (image-to-video, role="first_frame")
    //   - 2+ images → Seedance Mode C (omni-reference, all role="reference_image")
    //
    // For continuation clips (N>0): ONLY the extracted last frame, used as
    // first_frame. We deliberately drop the user's original references —
    // BytePlus ARK rejects mixing first_frame with reference_image
    // ("first/last frame content cannot be mixed with reference media
    // content"), and motion continuity beats identity locking for a smooth
    // 30s render. Identity continuity then relies on the lastFrame itself,
    // any subject description the user wrote into their clip-N prompt, and
    // the crossfade stitch that hides the seam.
    let nextImageUrls: string[] = [...sourceImageUrls];

    // Reserve a progress band per clip + a tail for stitch/upload.
    // Layout: 10% bootstrap → (85% / clipCount) per clip → 5% tail.
    const clipProgressShare = 85 / clipCount;

    // If a later clip fails AFTER at least one earlier clip succeeded we
    // salvage what we have rather than discard everything. Captured here so
    // the post-loop stitch + DB update can branch on partial vs full.
    let partialFailureReason: string | null = null;

    for (let i = 0; i < clipCount; i++) {
      const clipStartProgress = 10 + i * clipProgressShare;

      const clipPrompt = buildClipPrompt(userPrompts, i, clipCount);

      try {
        await publishStatus(
          generationId,
          "PROCESSING",
          Math.round(clipStartProgress),
          { step: `clip ${i + 1} of ${clipCount}: submitting` }
        );

        // Submit + poll a single 15 s clip
        const submitted = await seedanceProvider.submitTask({
          modelId: seedanceMapping.modelId,
          prompt: clipPrompt,
          imageUrls: nextImageUrls,
          durationSec: perClipDurationSec,
          resolution: seedanceMapping.resolutionLabel,
          signal: abortController.signal,
        });
        inFlightTaskIds.push(submitted.taskId);

        const finalState = await seedanceProvider.awaitTask(submitted.taskId, {
          signal: abortController.signal,
          onProgress: (state) => {
            // Map upstream progress (0–100 within the clip) onto our band
            const upstream = state.progressPercent ?? 50;
            const pipelinePct = Math.round(
              clipStartProgress + (clipProgressShare * upstream) / 100
            );
            void publishStatus(generationId, "PROCESSING", pipelinePct, {
              step: `clip ${i + 1} of ${clipCount}: ${state.status}`,
            });
          },
        });

        if (finalState.status !== "succeeded" || !finalState.videoUrl) {
          throw new Error(
            finalState.errorMessage ??
              `Seedance clip ${i + 1} ended in status '${finalState.status}'`
          );
        }

        // Drain the in-flight list now that we have the clip
        const idx = inFlightTaskIds.indexOf(submitted.taskId);
        if (idx >= 0) inFlightTaskIds.splice(idx, 1);

        // Download the rendered mp4
        const clipBuffer = await downloadVideo(finalState.videoUrl, {
          signal: abortController.signal,
        });
        clipBuffers.push(clipBuffer);

        // If there's another clip after this one, extract last frame and
        // upload it so the next clip can reference it as a URL.
        if (i < clipCount - 1) {
          const lastFrameBuffer = await extractLastFrame(clipBuffer, {
            signal: abortController.signal,
          });

          const frameUpload = await uploadToCloudinary(
            lastFrameBuffer,
            `ep-product/videos/${generation.userId}/frames`,
            `frame_${generationId}_${i}`
          );
          tempImagePublicIds.push(frameUpload.publicId);

          // Continuation clip uses ONLY the extracted last frame. See the
          // comment on `nextImageUrls` above for why originals are dropped.
          nextImageUrls = [frameUpload.secureUrl];

          logger.info(
            {
              generationId,
              clipIndex: i,
              framePublicId: frameUpload.publicId,
              nextImageCount: nextImageUrls.length,
            },
            "Extracted + uploaded conditioning frame for next clip"
          );
        }
      } catch (clipErr) {
        // No prior clips delivered — propagate normally so the row goes FAILED
        // and credits are fully refunded by the outer catch.
        if (clipBuffers.length === 0) {
          throw clipErr;
        }

        // Already have at least one clip in hand. Stop here and salvage:
        // continue to stitch + upload + COMPLETED with a partial-result flag.
        // This mostly handles the text-to-video bridge-frame moderation case
        // (clip 1 succeeded but Seedance's filter rejected its OWN extracted
        // frame as the input to clip 2), but applies to any mid-flight failure.
        partialFailureReason =
          clipErr instanceof Error ? clipErr.message : String(clipErr);
        logger.warn(
          {
            generationId,
            failedAtClip: i + 1,
            deliveredClips: clipBuffers.length,
            plannedClips: clipCount,
            reason: partialFailureReason,
          },
          "Clip failed after partial success — delivering salvaged clips"
        );
        break; // exit the for loop, continue to stitch + upload
      }
    }

    // ─── 4. Stitch clips ─────────────────────────────────
    // For multi-clip outputs we crossfade the seam (re-encode) instead of
    // hard-concatenating (stream-copy) — a 0.4s xfade hides the cut even when
    // Seedance regenerates the seam frame slightly differently. Falls back
    // to plain concat if crossfade fails for any reason.
    await publishStatus(generationId, "PROCESSING", 95, { step: "stitching clips" });

    let finalBuffer: Buffer;
    if (clipBuffers.length === 1) {
      finalBuffer = clipBuffers[0];
    } else {
      try {
        finalBuffer = await crossfadeClips(clipBuffers, {
          fadeDurationSec: 0.4,
          signal: abortController.signal,
        });
      } catch (xerr) {
        logger.warn(
          { generationId, err: xerr },
          "Crossfade stitch failed; falling back to hard-concat"
        );
        finalBuffer = await concatClips(clipBuffers, {
          signal: abortController.signal,
        });
      }
    }

    // ─── 5. Upload final video ───────────────────────────
    await publishStatus(generationId, "PROCESSING", 97, { step: "uploading" });

    const upload = await uploadVideoToCloudinary(
      finalBuffer,
      `ep-product/videos/${generation.userId}`,
      `vid_${generationId}`
    );
    finalVideoPublicId = upload.publicId;

    // ─── 6. Mark COMPLETED ───────────────────────────────
    const processingMs = Date.now() - startTime;

    // Partial-success accounting. When a later clip failed but we salvaged
    // earlier ones, bill only for what was actually delivered and refund
    // the remainder so the user pays for what they got.
    const deliveredClipCount = clipBuffers.length;
    const isPartial = partialFailureReason !== null && deliveredClipCount < clipCount;
    const deliveredDurationSec = deliveredClipCount * perClipDurationSec;
    const originalCreditCost = generation.creditCost;
    const billedCreditCost = isPartial
      ? Math.round((originalCreditCost * deliveredClipCount) / clipCount)
      : originalCreditCost;
    const refundAmount = originalCreditCost - billedCreditCost;

    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        resultVideoUrl: upload.secureUrl,
        resultVideoPublicId: upload.publicId,
        videoResolution: seedanceMapping.resolution,
        // Reflect what was actually delivered + billed, not what was requested.
        videoDurationSec: deliveredDurationSec,
        creditCost: billedCreditCost,
        processingMs,
        // Merge — preserve service-set sourceImageUrls + record partial state
        // so the frontend can show the right notice and audits stay accurate.
        providerConfig: ({
          ...(generationProviderConfig ?? {}),
          providerUsed: "seedance",
          variant: seedanceMapping.variant,
          modelId: seedanceMapping.modelId,
          requestedClipCount: clipCount,
          deliveredClipCount,
          requestedDurationSec: durationSec,
          deliveredDurationSec,
          ...(isPartial
            ? {
                partial: true,
                partialReason: partialFailureReason,
                refundedCredits: refundAmount,
                originalCreditCost,
              }
            : {}),
        } as any), // eslint-disable-line @typescript-eslint/no-explicit-any
      } as any,
    });

    // Refund the unused portion when partial. Use the standard refund helper —
    // same code path as full-failure refunds, just for a partial amount.
    if (isPartial && refundAmount > 0) {
      try {
        await subscriptionService.refundCredit(
          generation.userId,
          refundAmount,
          generationId
        );
        logger.info(
          {
            generationId,
            userId: generation.userId,
            refundAmount,
            billedCreditCost,
            originalCreditCost,
          },
          "Partial-success: refunded unused credits"
        );
      } catch (refundErr) {
        logger.error(
          { generationId, refundErr, refundAmount },
          "Partial-success: failed to refund unused credits (non-fatal)"
        );
      }
    }

    await publishStatus(generationId, "COMPLETED", 100, {
      resultVideoUrl: upload.secureUrl,
    });

    // Cleanup intermediate frame uploads (best effort — don't fail the job)
    for (const pid of tempImagePublicIds) {
      void deleteFromCloudinary(pid);
    }

    logger.info(
      {
        generationId,
        processingMs,
        tier,
        requestedDurationSec: durationSec,
        deliveredDurationSec,
        clipCount,
        deliveredClipCount,
        isPartial,
        partialReason: partialFailureReason,
        billedCreditCost,
        refundAmount,
        resultVideoUrl: upload.secureUrl,
      },
      isPartial ? "Video pipeline completed (partial)" : "Video pipeline completed"
    );

    return {
      generationId,
      status: "COMPLETED",
      resultVideoUrl: upload.secureUrl,
      resultVideoPublicId: upload.publicId,
      processingMs,
    };
  } catch (err) {
    const processingMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown video pipeline error";

    // Surface error-code metadata so the worker can decide whether to retry.
    // Content moderation, bad requests, and missing config are all permanent —
    // a retry will hit the same wall and just burn a queue slot.
    const errorCode =
      err instanceof AppError ? err.code : undefined;
    const nonRetryable =
      err instanceof AppError &&
      (err.code === "CONTENT_MODERATED" ||
        err.code === "BAD_REQUEST" ||
        err.code === "VALIDATION_ERROR" ||
        err.code === "FORBIDDEN" ||
        err.code === "NOT_FOUND" ||
        err.code === "INSUFFICIENT_CREDITS");

    logger.error(
      { generationId, err, processingMs, errorCode, nonRetryable },
      "Video generation pipeline failed"
    );

    // Mark FAILED in DB — but only if the row was actually a fresh attempt.
    // Otherwise a stale BullMQ retry would overwrite COMPLETED/CANCELLED state.
    if (shouldRefundOnFailure) {
      try {
        await prisma.generation.update({
          where: { id: generationId },
          data: { status: "FAILED", errorMessage, processingMs },
        });
      } catch {
        logger.error(
          { generationId },
          "Failed to update generation status to FAILED"
        );
      }
    }

    // Cancel any in-flight Seedance tasks so we don't pay for compute we'll discard
    for (const tid of inFlightTaskIds) {
      void seedanceProvider.cancelTask(tid);
    }

    // Best-effort: if we already uploaded the final video before failing, drop it
    if (finalVideoPublicId) {
      void deleteVideoFromCloudinary(finalVideoPublicId);
    }
    // Best-effort: drop any intermediate frame uploads
    for (const pid of tempImagePublicIds) {
      void deleteFromCloudinary(pid);
    }

    // Refund credits to the subscription balance — only on the first failure
    if (shouldRefundOnFailure) {
      try {
        const gen = await prisma.generation.findUnique({
          where: { id: generationId },
          select: { userId: true, creditCost: true },
        });
        if (gen && gen.creditCost > 0) {
          await subscriptionService.refundCredit(
            gen.userId,
            gen.creditCost,
            generationId
          );
          logger.info(
            { generationId, userId: gen.userId, amount: gen.creditCost },
            "Credits refunded after video pipeline failure"
          );
        }
      } catch (refundErr) {
        logger.error(
          { generationId, refundErr },
          "Failed to refund credits after video pipeline failure"
        );
      }
    }

    await publishStatus(generationId, "FAILED", 0, { errorMessage });

    return {
      generationId,
      status: "FAILED",
      errorMessage,
      errorCode,
      nonRetryable,
      processingMs,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
