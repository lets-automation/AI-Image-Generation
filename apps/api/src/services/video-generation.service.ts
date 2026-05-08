/**
 * Video Generation Service.
 *
 * Mirrors the shape of GenerationService but for image-to-video requests.
 * Handles validation, moderation, tier/quota checks, credit debit, row
 * creation, and enqueuing the BullMQ video job.
 *
 * Image flow remains untouched — the two services are intentionally
 * decoupled so video work can iterate without risking image regressions.
 */

import { prisma } from "../config/database.js";
import { logger } from "../utils/logger.js";
import {
  BadRequestError,
  ModerationError,
  NotFoundError,
} from "../utils/errors.js";
import {
  MAX_VIDEO_REFERENCE_IMAGES,
  SEEDANCE_TIER_MAP,
  type QualityTier,
  type VideoDuration,
} from "@ep/shared";
import { isTierAllowedByCostGuard, recordCreditRevenue } from "../resilience/cost-guard.js";
import { moderatePrompt } from "../moderation/index.js";
import { auditService } from "./audit.service.js";
import { subscriptionService } from "./subscription.service.js";
import { pricingService } from "./pricing.service.js";
import { enqueueVideoGeneration } from "../queues/video-generation.queue.js";

export interface CreateVideoGenerationInput {
  userId: string;
  templateId?: string;
  /**
   * 1+ source image URLs. The first is treated by Seedance as the conditioning
   * first frame; the rest become reference images for style / character.
   * Capped at {@link MAX_VIDEO_REFERENCE_IMAGES} (9, per the provider).
   */
  baseImageUrls?: string[];
  qualityTier: QualityTier;
  durationSec: VideoDuration;
  /**
   * Legacy single prompt — used for the whole video with a continuation
   * directive auto-applied to clip 2 of a 30s render. Prefer `prompts` for
   * 30s output; the single-prompt path is the source of the duplicate-script
   * artifact described in CR feedback.
   */
  prompt?: string;
  /**
   * Per-clip prompts. Length must match ceil(durationSec / 15) — i.e.
   * 1 entry for 15s, 2 entries for 30s. Each entry is moderated independently
   * and stored on providerConfig.prompts so the pipeline can route each
   * directly to its own Seedance clip.
   */
  prompts?: string[];
}

export class VideoGenerationService {
  /**
   * Create a new video generation request.
   *
   * Steps (mirrors image flow with adjustments for video):
   *   1. Moderate the prompt
   *   2. Resolve & validate the source image (template OR uploaded URL)
   *   3. Validate tier + cost guard
   *   4. Compute video credit cost (per-15s × clipCount)
   *   5. Debit credits from subscription
   *   6. Create the Generation row (jobType=VIDEO)
   *   7. Enqueue the video job; refund + delete on enqueue failure
   */
  async create(input: CreateVideoGenerationInput) {
    const {
      userId,
      templateId,
      baseImageUrls,
      qualityTier,
      durationSec,
      prompt,
      prompts,
    } = input;

    // 1. Resolve + moderate the prompt set.
    //
    // Per-clip prompts (`prompts`) are the new path — each clip of a 30s
    // render gets its own user-authored script, eliminating the duplicate-
    // dialogue / squished-script artifact from the legacy single-prompt
    // continuation flow. We moderate each entry independently so a clean
    // first half + risky second half is rejected, not silently approved.
    //
    // Length check happens in the Zod schema, but we re-validate here to
    // protect direct service callers (workers, scripts) that bypass HTTP.
    const expectedClipCount = Math.ceil(durationSec / 15);
    let promptList: string[];
    if (Array.isArray(prompts) && prompts.length > 0) {
      if (prompts.length !== expectedClipCount) {
        throw new BadRequestError(
          `Expected ${expectedClipCount} prompt${expectedClipCount === 1 ? "" : "s"} for a ${durationSec}s video, got ${prompts.length}`
        );
      }
      promptList = prompts.map((p) => p.trim());
    } else if (typeof prompt === "string" && prompt.trim().length > 0) {
      promptList = [prompt.trim()];
    } else {
      throw new BadRequestError("Provide either `prompt` or `prompts`");
    }

    for (const p of promptList) {
      const promptResult = moderatePrompt(p);
      if (!promptResult.allowed) {
        auditService.logModerationBlock(
          userId,
          promptResult.category ?? "unknown",
          promptResult.matchedPattern ?? ""
        );
        throw new ModerationError(promptResult.reason ?? "Content blocked");
      }
    }

    // Joined view used for the `Generation.prompt` column (list/detail/audit).
    // Keep a clear separator so downstream readers can tell the segments apart.
    const joinedPromptForRow =
      promptList.length === 1
        ? promptList[0]
        : promptList
            .map((p, i) => `[Clip ${i + 1} (${(i * 15) | 0}–${((i + 1) * 15) | 0}s)] ${p}`)
            .join("\n\n");

    // 2. Normalize source images. Empty list means text-to-video.
    const normalizedImageUrls = (baseImageUrls ?? [])
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter((u) => u.length > 0);
    // Drop duplicates while preserving order — first occurrence wins.
    const dedupedImageUrls = Array.from(new Set(normalizedImageUrls));
    if (dedupedImageUrls.length > MAX_VIDEO_REFERENCE_IMAGES) {
      throw new BadRequestError(
        `Up to ${MAX_VIDEO_REFERENCE_IMAGES} reference images are allowed`
      );
    }

    let primaryImageUrl: string | null = null;
    let templateContentType: "EVENT" | "POSTER" = "EVENT";
    let templateVersion: number | null = null;

    if (templateId) {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
        select: {
          id: true,
          imageUrl: true,
          contentType: true,
          isActive: true,
          layoutVersion: true,
          deletedAt: true,
        },
      });
      if (!template || template.deletedAt) throw new NotFoundError("Template");
      if (!template.isActive) throw new BadRequestError("Template is inactive");
      primaryImageUrl = template.imageUrl;
      templateContentType = template.contentType;
      templateVersion = template.layoutVersion;
    } else if (dedupedImageUrls.length > 0) {
      primaryImageUrl = dedupedImageUrls[0];
    }
    // else: text-to-video — no primary image, no template. Valid.

    // The pipeline reads the full ordered set from providerConfig.sourceImageUrls
    // so multi-image submissions retain all references through the worker hop.
    // For template-based jobs we only have the single template image, which is
    // also the "primary". For text-to-video, this stays empty.
    const pipelineImageUrls: string[] =
      dedupedImageUrls.length > 0
        ? dedupedImageUrls
        : primaryImageUrl
          ? [primaryImageUrl]
          : [];

    // 3. Validate Seedance mapping + cost guard
    if (!SEEDANCE_TIER_MAP[qualityTier]) {
      throw new BadRequestError(
        `Quality tier '${qualityTier}' is not supported for video generation`
      );
    }

    // Subscription tier access (re-uses the image flow's tier gating)
    await subscriptionService.checkTierAccess(userId, qualityTier);

    // STANDARD/PREMIUM are gated by cost guard exactly like images
    if (qualityTier !== "BASIC") {
      const costAllowed = await isTierAllowedByCostGuard(qualityTier);
      if (!costAllowed) {
        throw new BadRequestError(
          `Quality tier '${qualityTier}' is temporarily unavailable due to high demand. Please try Basic tier or try again later.`
        );
      }
    }

    // 4. Compute credit cost
    const creditCost = await pricingService.getVideoCreditCost(
      qualityTier,
      durationSec
    );
    if (creditCost <= 0) {
      throw new BadRequestError("Video pricing is misconfigured");
    }

    // 5. Create Generation row first (so we have an id for the debit audit
    //    trail), then debit. If the debit throws, delete the row to keep DB clean.
    const generation = await prisma.generation.create({
      data: {
        userId,
        templateId: templateId ?? null,
        jobType: "VIDEO",
        contentType: templateContentType,
        qualityTier,
        // Video doesn't use language/orientation/positionMap/fieldValues, but
        // those columns are NOT NULL on the existing schema. Use safe defaults.
        language: "ENGLISH",
        prompt: joinedPromptForRow,
        fieldValues: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        positionMap: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        status: "QUEUED",
        creditCost,
        templateVersion,
        // baseImageUrl mirrors the primary image so existing tooling that
        // reads this column (admin views, audit logs) keeps working. The full
        // ordered set lives on providerConfig.sourceImageUrls.
        baseImageUrl: templateId ? null : primaryImageUrl,
        videoDurationSec: durationSec,
        // videoResolution is set by the pipeline once we know exactly what
        // Seedance returned — admin/cost-guard can prefill it but we don't
        // need to here.
        providerConfig: ({
          sourceImageUrls: pipelineImageUrls,
          referenceImageCount: pipelineImageUrls.length,
          // Per-clip prompts. Always written as an array — single-clip 15s
          // jobs get a length-1 array. The pipeline reads this directly so
          // each Seedance task receives its own authored prompt instead of
          // a synthesized continuation directive.
          prompts: promptList,
        } as any), // eslint-disable-line @typescript-eslint/no-explicit-any
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // 6. Debit credits — clean up row if debit fails
    try {
      await subscriptionService.checkAndDebitCredit(userId, creditCost, generation.id);
    } catch (err) {
      await prisma.generation
        .delete({ where: { id: generation.id } })
        .catch(() => {});
      throw err;
    }

    await recordCreditRevenue(creditCost);

    // 7. Enqueue — refund + mark FAILED on enqueue failure
    try {
      const jobId = await enqueueVideoGeneration({
        generationId: generation.id,
        qualityTier,
        durationSec,
        userId,
      });
      await prisma.generation.update({
        where: { id: generation.id },
        data: { jobId },
      });
    } catch (enqueueErr) {
      logger.error(
        { err: enqueueErr, generationId: generation.id, userId },
        "Failed to enqueue video generation — refunding credits"
      );

      await prisma.generation
        .update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            errorMessage: "Failed to queue video — please try again",
          },
        })
        .catch(() => {});

      try {
        await subscriptionService.refundCredit(userId, creditCost, generation.id);
      } catch (refundErr) {
        logger.error(
          { err: refundErr, userId, creditCost },
          "CRITICAL: Failed to refund credits after video enqueue failure"
        );
      }

      throw new BadRequestError(
        "Video generation service is temporarily unavailable. Credits have been refunded. Please try again."
      );
    }

    logger.info(
      {
        generationId: generation.id,
        userId,
        qualityTier,
        durationSec,
        creditCost,
        imageCount: pipelineImageUrls.length,
        promptCount: promptList.length,
      },
      "Video generation created and enqueued"
    );

    return {
      id: generation.id,
      status: generation.status,
      qualityTier,
      durationSec,
      creditCost,
      jobType: "VIDEO" as const,
    };
  }
}

export const videoGenerationService = new VideoGenerationService();
