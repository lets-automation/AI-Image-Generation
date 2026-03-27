import { prisma } from "../config/database.js";
import { logger } from "../utils/logger.js";
import sharp from "sharp";
import { renderOverlay, type OverlayField } from "./renderers/overlay.js";
import { renderEnhanced } from "./renderers/enhanced.js";
import { uploadToCloudinary } from "./upload/cloudinary.js";
import { isTierSupported } from "./router.js";
import { isTierAllowedByCostGuard } from "../resilience/cost-guard.js";
import { getRedis } from "../config/redis.js";
import { subscriptionService } from "../services/subscription.service.js";
import { TIER_CONFIGS, ORIENTATION_CONFIGS } from "@ep/shared";
import type { QualityTier, Position, Language, Orientation } from "@ep/shared";

/**
 * Pipeline Orchestrator
 *
 * Executes the full generation pipeline:
 * 1. Load generation record from DB
 * 2. Validate tier support + cost guard
 * 3. Load base image (template or user-uploaded)
 * 4. Build overlay fields from generation data
 * 5. Route to AI renderer (all tiers use AI generation)
 * 6. Upload result to Cloudinary
 * 7. Update Generation status
 * 8. On failure: refund credits to subscription balance
 *
 * ALL tiers use AI generation — the template is a style reference,
 * not a base for simple text overlay. The overlay renderer is only
 * used as an emergency fallback when cost guard blocks all AI.
 *
 * Called by the BullMQ worker for each job.
 */

export interface PipelineInput {
  generationId: string;
}

export interface PipelineResult {
  generationId: string;
  status: "COMPLETED" | "FAILED";
  resultImageUrl?: string;
  resultPublicId?: string;
  errorMessage?: string;
  processingMs: number;
}

/**
 * Publish status updates via Redis pub/sub.
 * Frontend SSE endpoint subscribes to these.
 */
async function publishStatus(
  generationId: string,
  status: string,
  progress: number,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const redis = getRedis();
    const channel = `generation:${generationId}:status`;
    const payload = JSON.stringify({ status, progress, ...extra });
    await redis.publish(channel, payload);
  } catch {
    // Non-critical — SSE will poll DB as fallback
  }
}

async function buildCombinedReferenceImage(
  imageUrls: string[],
  width: number,
  height: number
): Promise<Buffer> {
  const validUrls = imageUrls.map((url) => url.trim()).filter((url) => url.length > 0);

  if (validUrls.length === 0) {
    throw new Error("No source images provided for combine mode");
  }

  const imageBuffers = await Promise.all(
    validUrls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch source image: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    })
  );

  if (imageBuffers.length === 1) {
    return sharp(imageBuffers[0])
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();
  }

  const cols = Math.ceil(Math.sqrt(imageBuffers.length));
  const rows = Math.ceil(imageBuffers.length / cols);
  const tileWidth = Math.ceil(width / cols);
  const tileHeight = Math.ceil(height / rows);

  const composites = await Promise.all(
    imageBuffers.map(async (buffer, index) => {
      const tile = await sharp(buffer)
        .resize(tileWidth, tileHeight, { fit: "cover" })
        .png()
        .toBuffer();

      const col = index % cols;
      const row = Math.floor(index / cols);

      return {
        input: tile,
        left: col * tileWidth,
        top: row * tileHeight,
      };
    })
  );

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 248, g: 248, b: 248 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function executePipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const startTime = Date.now();
  const { generationId } = input;

  // Track whether this is a fresh attempt — only refund credits on first failure,
  // never on BullMQ retries of an already-FAILED generation.
  let shouldRefundOnFailure = false;

  try {
    // 1. Load generation record
    await publishStatus(generationId, "PROCESSING", 10);

    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: {
        template: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!generation) {
      throw new Error(`Generation ${generationId} not found`);
    }

    if (generation.status !== "QUEUED" && generation.status !== "PROCESSING") {
      // Already completed or failed — don't refund on this retry
      throw new Error(`Generation ${generationId} has unexpected status: ${generation.status}`);
    }

    // This is a fresh attempt — if it fails, we should refund
    shouldRefundOnFailure = true;

    const generationProviderConfig =
      generation.providerConfig && typeof generation.providerConfig === "object"
        ? (generation.providerConfig as Record<string, unknown>)
        : null;
    const combineMode = generationProviderConfig?.customUploadMode === "COMBINE";
    const sourceImageUrls = Array.isArray(generationProviderConfig?.sourceImageUrls)
      ? generationProviderConfig.sourceImageUrls
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

    // Mark as processing
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: "PROCESSING" },
    });

    // 2. Validate tier support + cost guard
    const tier = generation.qualityTier as QualityTier;

    if (!isTierSupported(tier)) {
      throw new Error(`Tier ${tier} is not supported.`);
    }

    // Check cost guardrails — may downgrade AI tiers if daily spend is too high
    const costAllowed = await isTierAllowedByCostGuard(tier);
    let effectiveTier = tier;
    let useFallbackOverlay = false;

    if (!costAllowed) {
      if (tier === "BASIC") {
        // BASIC blocked by cost guard — fall back to overlay-only rendering
        logger.warn(
          { tier, generationId },
          "Cost guard blocked BASIC AI — falling back to overlay-only"
        );
        useFallbackOverlay = true;
      } else {
        // STANDARD/PREMIUM blocked — fall back to BASIC AI
        logger.warn(
          { tier, generationId },
          "Cost guard blocked AI tier — falling back to BASIC"
        );
        effectiveTier = "BASIC" as QualityTier;

        // If BASIC is also blocked (emergency), fall back to overlay
        const basicAllowed = await isTierAllowedByCostGuard("BASIC" as QualityTier);
        if (!basicAllowed) {
          logger.warn({ generationId }, "All AI tiers blocked — falling back to overlay-only");
          useFallbackOverlay = true;
        }
      }
    }

    await publishStatus(generationId, "PROCESSING", 20);

    // 3. Determine base image source and template metadata
    let baseImageUrl: string;
    let baseImageBuffer: Buffer | undefined;
    let imageWidth: number;
    let imageHeight: number;
    let safeZones: PrismaJson.TemplateSafeZones = [];
    let templateDescription: string | undefined;

    if (generation.template) {
      baseImageUrl = generation.template.imageUrl;
      imageWidth = generation.template.width;
      imageHeight = generation.template.height;
      safeZones = (generation.template.safeZones ?? []) as unknown as PrismaJson.TemplateSafeZones;
      // Get template description from metadata
      const metadata = generation.template.metadata as Record<string, unknown> | null;
      templateDescription = (metadata?.description as string) ?? undefined;
    } else if (generation.baseImageUrl) {
      baseImageUrl = generation.baseImageUrl;
      // For user-uploaded images, use default dimensions
      imageWidth = 1080;
      imageHeight = 1080;
    } else {
      throw new Error("Generation has no template or base image URL");
    }

    // Override dimensions with user-chosen orientation (if provided)
    const orientation = generation.orientation as Orientation | null;
    if (orientation && ORIENTATION_CONFIGS[orientation]) {
      const oc = ORIENTATION_CONFIGS[orientation];
      imageWidth = oc.width;
      imageHeight = oc.height;
      logger.info({ generationId, orientation, imageWidth, imageHeight }, "Using user-selected orientation");
    }

    if (!generation.templateId && combineMode && sourceImageUrls.length > 1) {
      try {
        baseImageBuffer = await buildCombinedReferenceImage(sourceImageUrls, imageWidth, imageHeight);
      } catch (err) {
        logger.warn(
          { generationId, err, sourceImageCount: sourceImageUrls.length },
          "Failed to build combined reference image; falling back to primary source image"
        );
      }
    }

    await publishStatus(generationId, "PROCESSING", 40);

    // 5. Build overlay fields from generation data
    const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>;
    const positionMap = (generation.positionMap ?? {}) as Record<string, Position>;

    // Fetch field schemas to know field types
    const requestCategoryId =
      typeof generationProviderConfig?.requestCategoryId === "string"
        ? generationProviderConfig.requestCategoryId
        : null;
    const schemaCategoryId = generation.template?.categoryId ?? requestCategoryId;

    let fieldSchemas: Array<{ fieldKey: string; fieldType: string }> = [];
    if (schemaCategoryId) {
      fieldSchemas = await prisma.fieldSchema.findMany({
        where: { categoryId: schemaCategoryId },
        select: { fieldKey: true, fieldType: true },
      });
    }

    const fieldTypeMap = new Map(fieldSchemas.map((f) => [f.fieldKey, f.fieldType]));

    const toRenderableText = (raw: unknown): string | null => {
      if (raw === null || raw === undefined) return null;
      const text = String(raw).trim();
      return text.length > 0 ? text : null;
    };

    const inferFieldType = (
      fieldKey: string,
      textValue: string,
      schemaType?: string
    ): OverlayField["fieldType"] => {
      if (schemaType) return schemaType as OverlayField["fieldType"];

      const key = fieldKey.toLowerCase();
      if (key.includes("logo") || key.includes("image")) return "IMAGE";
      if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) return "PHONE";
      if (key.includes("email") || textValue.includes("@")) return "EMAIL";
      if (key.includes("url") || key.includes("website") || /^https?:\/\//i.test(textValue)) return "URL";
      if (/^[-+]?\d+(\.\d+)?$/.test(textValue)) return "NUMBER";
      return "TEXT";
    };

    // Flatten field values — grouped (repeatable) entries become individual overlay fields
    const overlayFields: OverlayField[] = [];
    for (const [key, value] of Object.entries(fieldValues)) {
      if (Array.isArray(value)) {
        // Repeatable values can be arrays of objects (grouped entries)
        // or arrays of primitives (single repeatable field).
        const groupedFallbackBySubKey = new Map<
          string,
          {
            position: Position;
            fieldType: OverlayField["fieldType"];
            values: string[];
          }
        >();
        const primitiveFallbackValues: string[] = [];

        for (let i = 0; i < value.length; i++) {
          const entry = value[i];

          if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
            for (const [subKey, subVal] of Object.entries(entry as Record<string, unknown>)) {
              const textValue = toRenderableText(subVal);
              if (!textValue) continue;

              const compositeKey = `${key}_${i + 1}_${subKey}`;
              const compositePos = positionMap[compositeKey];

              if (compositePos) {
                overlayFields.push({
                  fieldKey: compositeKey,
                  value: textValue,
                  fieldType: inferFieldType(subKey, textValue, fieldTypeMap.get(subKey)),
                  position: compositePos,
                });
                continue;
              }

              const fallbackPos = positionMap[subKey];
              if (fallbackPos) {
                const existing = groupedFallbackBySubKey.get(subKey);
                if (existing) {
                  existing.values.push(textValue);
                } else {
                  groupedFallbackBySubKey.set(subKey, {
                    position: fallbackPos,
                    fieldType: inferFieldType(subKey, textValue, fieldTypeMap.get(subKey)),
                    values: [textValue],
                  });
                }
              }
            }
            continue;
          }

          const textValue = toRenderableText(entry);
          if (!textValue) continue;

          const compositeKey = `${key}_${i + 1}`;
          const compositePos = positionMap[compositeKey];
          if (compositePos) {
            overlayFields.push({
              fieldKey: compositeKey,
              value: textValue,
              fieldType: inferFieldType(key, textValue, fieldTypeMap.get(key)),
              position: compositePos,
            });
          } else if (positionMap[key]) {
            primitiveFallbackValues.push(textValue);
          }
        }

        for (const [subKey, aggregate] of groupedFallbackBySubKey.entries()) {
          overlayFields.push({
            fieldKey: `${key}_${subKey}_combined`,
            value: aggregate.values.join(" | "),
            fieldType: aggregate.fieldType,
            position: aggregate.position,
          });
        }

        if (primitiveFallbackValues.length > 0 && positionMap[key]) {
          const joinedValue = primitiveFallbackValues.join(" | ");
          overlayFields.push({
            fieldKey: `${key}_combined`,
            value: joinedValue,
            fieldType: inferFieldType(key, joinedValue, fieldTypeMap.get(key)),
            position: positionMap[key],
          });
        }
      } else if (positionMap[key]) {
        const textValue = toRenderableText(value);
        if (textValue) {
          overlayFields.push({
            fieldKey: key,
            value: textValue,
            fieldType: inferFieldType(key, textValue, fieldTypeMap.get(key)),
            position: positionMap[key],
          });
        }
      }
    }

    const duplicatePositions = new Map<Position, string[]>();
    for (const field of overlayFields) {
      const existing = duplicatePositions.get(field.position) ?? [];
      existing.push(field.fieldKey);
      duplicatePositions.set(field.position, existing);
    }

    for (const [position, fieldKeys] of duplicatePositions.entries()) {
      if (fieldKeys.length > 1) {
        logger.warn(
          { generationId, position, fieldKeys },
          "Multiple overlay fields mapped to same position; output may appear crowded"
        );
      }
    }

    // 6. Route to renderer
    await publishStatus(generationId, "PROCESSING", 50);

    let resultBuffer: Buffer;
    let providerUsed: string | null = null;
    let aiCostCents = 0;

    const timeoutMs = TIER_CONFIGS[effectiveTier]?.jobTimeoutMs ?? 120_000;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      if (useFallbackOverlay) {
        // Cost guard emergency — overlay-only rendering (no AI)
        logger.info({ generationId, tier }, "Pipeline: cost guard fallback to overlay renderer");

        const overlayResult = await renderOverlay({
          baseImageUrl,
          baseImageBuffer,
          safeZones,
          fields: overlayFields,
          language: generation.language as Language,
          imageWidth,
          imageHeight,
          preview: false,
        });

        resultBuffer = overlayResult.buffer;
      } else {
        // ALL tiers use the enhanced renderer (AI generation)
        // Template is passed as style reference, not for compositing
        logger.info({ generationId, tier, effectiveTier }, "Pipeline: routing to AI generation (enhanced renderer)");
        await publishStatus(generationId, "PROCESSING", 55, { step: "AI generation" });

        const enhancedResult = await renderEnhanced({
          baseImageUrl,
          baseImageBuffer,
          safeZones,
          fields: overlayFields,
          language: generation.language as Language,
          imageWidth,
          imageHeight,
          prompt: generation.prompt,
          qualityTier: effectiveTier,
          signal: abortController.signal,
          templateDescription,
        });

        resultBuffer = enhancedResult.buffer;
        providerUsed = enhancedResult.providerUsed;
        aiCostCents = enhancedResult.aiCostCents;
      }
    } finally {
      clearTimeout(timeout);
    }

    await publishStatus(generationId, "PROCESSING", 80);

    // 7. Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(
      resultBuffer,
      `ep-product/generations/${generation.userId}`,
      `gen_${generationId}`
    );

    await publishStatus(generationId, "PROCESSING", 95);

    // 8. Update generation record
    const processingMs = Date.now() - startTime;
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        resultImageUrl: uploadResult.secureUrl,
        resultPublicId: uploadResult.publicId,
        processingMs,
        providerConfig: providerUsed
          ? ({ providerUsed, aiCostCents, effectiveTier } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          : undefined,
      },
    });

    // Increment template usage count
    if (generation.templateId) {
      await prisma.template.update({
        where: { id: generation.templateId },
        data: { usageCount: { increment: 1 } },
      }).catch(() => {
        // Non-critical
      });
    }

    await publishStatus(generationId, "COMPLETED", 100, {
      resultImageUrl: uploadResult.secureUrl,
    });

    logger.info(
      { generationId, processingMs, tier, effectiveTier, providerUsed, aiCostCents },
      "Generation pipeline completed"
    );

    return {
      generationId,
      status: "COMPLETED",
      resultImageUrl: uploadResult.secureUrl,
      resultPublicId: uploadResult.publicId,
      processingMs,
    };
  } catch (err) {
    const processingMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown pipeline error";

    logger.error({ generationId, err, processingMs }, "Generation pipeline failed");

    // Update generation status to FAILED
    try {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          errorMessage,
          processingMs,
        },
      });
    } catch {
      logger.error({ generationId }, "Failed to update generation status to FAILED");
    }

    // Refund credits back to subscription balance — ONLY on first failure,
    // not on BullMQ retries of an already-FAILED generation
    if (shouldRefundOnFailure) {
      try {
        const generation = await prisma.generation.findUnique({
          where: { id: generationId },
          select: { userId: true, creditCost: true },
        });
        if (generation && generation.creditCost > 0) {
          await subscriptionService.refundCredit(
            generation.userId,
            generation.creditCost,
            generationId
          );
          logger.info(
            { generationId, userId: generation.userId, amount: generation.creditCost },
            "Credits refunded after pipeline failure"
          );
        }
      } catch (refundErr) {
        logger.error({ generationId, refundErr }, "Failed to refund credits after pipeline failure");
      }
    }

    await publishStatus(generationId, "FAILED", 0, { errorMessage });

    return {
      generationId,
      status: "FAILED",
      errorMessage,
      processingMs,
    };
  }
}
