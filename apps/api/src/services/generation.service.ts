import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database.js";
import { enqueueGeneration } from "../queues/generation.queue.js";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ModerationError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { TIER_CONFIGS, IDEMPOTENCY, ALL_LANGUAGES, LANGUAGE_COUNTRY_MAP, type QualityTier } from "@ep/shared";
import { isTierSupported } from "../engine/router.js";
import { isTierAllowedByCostGuard, recordCreditRevenue } from "../resilience/cost-guard.js";
import { hasConflicts } from "../engine/layout/collision.js";
import { moderatePrompt, moderateFieldValue } from "../moderation/index.js";
import { auditService } from "./audit.service.js";
import { subscriptionService } from "./subscription.service.js";
import type { Position } from "@ep/shared";

// ─── Types ───────────────────────────────────────────────

/** Field values can be flat (string/number) or grouped arrays for repeatable fields */
type FieldValueEntry = string | number;
type GroupedFieldValues = Array<Record<string, FieldValueEntry>>;
type FieldValues = Record<string, FieldValueEntry | GroupedFieldValues>;

interface CreateGenerationInput {
  userId: string;
  templateId?: string;
  baseImageUrl?: string;
  baseImageUrls?: string[];
  customUploadMode?: "SEPARATE" | "COMBINE";
  contentType: "EVENT" | "POSTER";
  categoryId?: string;
  qualityTier: QualityTier;
  prompt: string;
  fieldValues: FieldValues;
  positionMap: Record<string, string>;
  orientation?: string; // User-chosen: SQUARE, PORTRAIT, LANDSCAPE, STORY, WIDE
  idempotencyKey?: string;
  /** Selected languages — defaults to ALL_LANGUAGES if not provided */
  languages?: string[];
  isPublic?: boolean;
}

// ─── Service ─────────────────────────────────────────────

export class GenerationService {
  /**
   * Create a new generation request.
   *
   * Flow:
   * 1. Check idempotency key (skip duplicate requests)
   * 2. Check generation hash cache (return cached result if match)
   * 3. Validate template / base image
   * 4. Validate position conflicts
   * 5. Validate tier support
   * 6. Get credit cost from ModelPricing or tier defaults
   * 7. Debit credits from subscription
   * 8. Create Generation record
   * 9. Store idempotency key
   * 10. Enqueue BullMQ jobs (one per language — all 10 languages generated)
   */
  async create(input: CreateGenerationInput) {
    const {
      userId,
      templateId,
      baseImageUrl,
      baseImageUrls,
      customUploadMode,
      contentType,
      categoryId,
      qualityTier,
      prompt,
      fieldValues,
      positionMap,
      idempotencyKey,
      languages,
      isPublic,
    } = input;

    const normalizedBaseImageUrls = (baseImageUrls ?? [])
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (!templateId && baseImageUrl) {
      normalizedBaseImageUrls.unshift(baseImageUrl);
    }

    const sourceImageUrls = Array.from(new Set(normalizedBaseImageUrls));
    const isCustomUpload = !templateId;
    const effectiveCustomUploadMode: "SEPARATE" | "COMBINE" =
      customUploadMode === "COMBINE" ? "COMBINE" : "SEPARATE";

    // Use selected languages or fall back to all
    const selectedLanguages = languages && languages.length > 0 ? languages : ALL_LANGUAGES;

    // 1. Check idempotency key
    if (idempotencyKey) {
      const existing = await this.checkIdempotencyKey(idempotencyKey, input);
      if (existing) {
        logger.info({ idempotencyKey }, "Idempotent request — returning cached response");
        return existing;
      }
    }

    // 2. Moderate prompt and field values
    const promptResult = moderatePrompt(prompt);
    if (!promptResult.allowed) {
      auditService.logModerationBlock(userId, promptResult.category ?? "unknown", promptResult.matchedPattern ?? "");
      throw new ModerationError(promptResult.reason ?? "Content blocked");
    }

    const moderateSingleValue = (fieldKey: string, rawValue: unknown): void => {
      const fieldResult = moderateFieldValue(fieldKey, String(rawValue));
      if (!fieldResult.allowed) {
        auditService.logModerationBlock(
          userId,
          fieldResult.category ?? "unknown",
          fieldResult.matchedPattern ?? ""
        );
        throw new ModerationError(fieldResult.reason ?? "Field content blocked");
      }
    };

    for (const [key, value] of Object.entries(fieldValues)) {
      if (Array.isArray(value)) {
        // Repeatable/grouped fields can be arrays of primitives or arrays of objects.
        for (let i = 0; i < value.length; i++) {
          const entry = value[i];
          if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
            for (const [subKey, subVal] of Object.entries(entry)) {
              moderateSingleValue(`${key}.${subKey}`, subVal);
            }
          } else {
            moderateSingleValue(`${key}.${i + 1}`, entry);
          }
        }
      } else {
        moderateSingleValue(key, value);
      }
    }

    // 3. Validate template
    let templateVersion: number | null = null;
    if (templateId) {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
        select: { id: true, isActive: true, layoutVersion: true, deletedAt: true },
      });
      if (!template || template.deletedAt) throw new NotFoundError("Template");
      if (!template.isActive) throw new BadRequestError("Template is inactive");
      templateVersion = template.layoutVersion;
    } else if (sourceImageUrls.length === 0) {
      throw new BadRequestError("At least one base image is required for custom upload generation");
    }

    const separateByImage = isCustomUpload && effectiveCustomUploadMode === "SEPARATE";
    const targetImageUrls = separateByImage
      ? sourceImageUrls
      : [sourceImageUrls[0] ?? baseImageUrl ?? null];

    // 3b. Validate position conflicts
    if (hasConflicts(positionMap as Record<string, Position>)) {
      throw new BadRequestError("Position conflicts detected — two or more fields share the same position");
    }

    // 4. Validate tier support + cost guard
    if (!isTierSupported(qualityTier)) {
      throw new BadRequestError(
        `Quality tier '${qualityTier}' is not available.`
      );
    }

    // 4b. Check subscription tier access
    await subscriptionService.checkTierAccess(userId, qualityTier);

    // Check cost guardrails — block STANDARD/PREMIUM if spend limits exceeded
    if (qualityTier !== "BASIC") {
      const costAllowed = await isTierAllowedByCostGuard(qualityTier);
      if (!costAllowed) {
        throw new BadRequestError(
          `Quality tier '${qualityTier}' is temporarily unavailable due to high demand. Please try Basic tier or try again later.`
        );
      }
    }

    // 5. Get credit cost — multiply by total requested outputs
    const baseCreditCost = await this.getCreditCost(qualityTier);
    const outputCount = selectedLanguages.length * targetImageUrls.length;
    const creditCost = baseCreditCost * outputCount;

    // 6. Generate a batchId to group all 10 language variants
    const batchId = uuidv4();

    // 7. Create Generation records for requested outputs (languages x images in separate mode)
    const generations = [];
    const wantsPublic = isPublic ?? false;

    for (let imageIndex = 0; imageIndex < targetImageUrls.length; imageIndex++) {
      const targetImageUrl = targetImageUrls[imageIndex];

      for (const [languageIndex, lang] of selectedLanguages.entries()) {
        const generationHash = this.computeGenerationHash({
          ...input,
          baseImageUrl: targetImageUrl ?? undefined,
          baseImageUrls: sourceImageUrls,
          customUploadMode: effectiveCustomUploadMode,
          languages: [lang],
        });

        // Auto-populate target countries from language when requesting showcase
        const showcaseTargetCountries = wantsPublic
          ? (LANGUAGE_COUNTRY_MAP[lang] ?? [])
          : null;

        const isFirstOutput = imageIndex === 0 && languageIndex === 0;
        const generation = await prisma.generation.create({
          data: {
            userId,
            templateId: templateId ?? null,
            contentType,
            qualityTier,
            language: lang as any,
            prompt,
            fieldValues: fieldValues as any,
            positionMap: positionMap as any,
            orientation: input.orientation ?? null,
            status: "QUEUED",
            creditCost: isFirstOutput ? creditCost : 0, // Debit once for the batch
            templateVersion,
            baseImageUrl: targetImageUrl,
            providerConfig: ({
              ...(categoryId ? { requestCategoryId: categoryId } : {}),
              ...(isCustomUpload
                ? {
                    customUploadMode: effectiveCustomUploadMode,
                    sourceImageUrls,
                  }
                : {}),
            } as any),
            generationHash,
            batchId,
            isPublic: false, // Stays false until admin approves
            showcaseStatus: wantsPublic ? "PENDING" : "NONE",
            showcaseTargetCountries: showcaseTargetCountries as any,
          } as any,
        });
        generations.push(generation);
      }
    }

    // 7b. Debit credits once for the entire batch
    try {
      await subscriptionService.checkAndDebitCredit(userId, creditCost, generations[0].id);
    } catch (err) {
      // Debit failed — clean up all generation records
      await prisma.generation.deleteMany({
        where: { batchId } as any,
      });
      throw err;
    }

    // 7c. Record credit revenue
    await recordCreditRevenue(creditCost);

    // 8. Store idempotency key (linked to first generation)
    if (idempotencyKey) {
      await this.storeIdempotencyKey(idempotencyKey, input, generations[0].id);
    }

    // 9. Enqueue all jobs — wrap in try/catch to handle Redis failures
    try {
      for (const gen of generations) {
        const jobId = await enqueueGeneration({
          generationId: gen.id,
          qualityTier,
          userId,
        });

        await prisma.generation.update({
          where: { id: gen.id },
          data: { jobId },
        });
      }
    } catch (enqueueErr) {
      // Enqueue failed (likely Redis issue) — refund credits and mark as FAILED
      logger.error(
        { err: enqueueErr, batchId, userId },
        "Failed to enqueue generation jobs — refunding credits"
      );

      // Mark all generations in this batch as FAILED
      await prisma.generation.updateMany({
        where: { batchId } as any,
        data: {
          status: "FAILED",
          errorMessage: "Failed to queue generation — please try again",
        },
      });

      // Refund credits
      try {
        await subscriptionService.refundCredit(userId, creditCost, generations[0].id);
      } catch (refundErr) {
        logger.error(
          { err: refundErr, userId, creditCost },
          "CRITICAL: Failed to refund credits after enqueue failure"
        );
      }

      throw new BadRequestError(
        "Generation service is temporarily unavailable. Credits have been refunded. Please try again."
      );
    }

    logger.info(
      { batchId, count: generations.length, qualityTier, creditCost },
      "Multi-language generation batch created and enqueued"
    );

    return {
      batchId,
      creditCost,
      generations: generations.map((g) => this.formatResponse(g)),
    };
  }

  /**
   * Get a generation by ID (owned by user).
   */
  async getById(generationId: string, userId: string) {
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
    });

    if (!generation || generation.userId !== userId) {
      throw new NotFoundError("Generation");
    }

    return this.formatResponse(generation);
  }

  /**
   * List user's generations with pagination and filters.
   */
  async list(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      contentType?: string;
    } = {}
  ) {
    const { page = 1, limit = 20, status, contentType } = options;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;

    const [generations, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generation.count({ where }),
    ]);

    return {
      data: generations.map((g) => this.formatResponse(g)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List approved public generations with country-based filtering.
   * Only shows generations that:
   * 1. Have showcaseStatus = APPROVED
   * 2. Are COMPLETED
   * 3. Target the requesting user's country (or have no country restriction)
   */
  async listPublic(
    options: {
      page?: number;
      limit?: number;
      contentType?: string;
      country?: string | null;
    } = {}
  ) {
    const { page = 1, limit = 20, contentType, country } = options;
    const skip = (page - 1) * limit;

    const baseWhere: Record<string, unknown> = {
      showcaseStatus: "APPROVED",
      status: "COMPLETED",
      isPublic: true,
    };
    if (contentType) baseWhere.contentType = contentType;

    const include = {
      user: { select: { name: true } },
      template: {
        select: {
          name: true,
          category: { select: { id: true, name: true } },
        },
      },
      showcaseCategory: { select: { id: true, name: true } },
    } as any;

    // Preferred path: DB-level country filtering for efficient pagination.
    if (country) {
      const countryWhere = {
        ...baseWhere,
        OR: [
          { showcaseTargetCountries: null },
          { showcaseTargetCountries: { equals: [] } },
          { showcaseTargetCountries: { array_contains: [country] } },
        ],
      } as any;

      try {
        const [generations, total] = await Promise.all([
          prisma.generation.findMany({
            where: countryWhere,
            include,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
          prisma.generation.count({ where: countryWhere }),
        ]);

        return {
          data: generations.map((g: any) => this.formatPublicResponse(g)),
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (err) {
        logger.warn({ err }, "DB-level country filter failed; using application fallback");
      }
    }

    // Fallback path: application-level filtering to preserve behavior across JSON dialect differences.
    const allGenerations = await prisma.generation.findMany({
      where: baseWhere,
      include,
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const filtered = country
      ? allGenerations.filter((g: any) => {
          const targets = g.showcaseTargetCountries as string[] | null;
          if (!targets || targets.length === 0) return true;
          return targets.includes(country);
        })
      : allGenerations;

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return {
      data: paginated.map((g: any) => this.formatPublicResponse(g)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get current generation status (for SSE polling).
   */
  async getStatus(generationId: string, userId: string) {
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      select: {
        id: true,
        userId: true,
        status: true,
        resultImageUrl: true,
        errorMessage: true,
        processingMs: true,
      },
    });

    if (!generation || generation.userId !== userId) {
      throw new NotFoundError("Generation");
    }

    let progress = 0;
    switch (generation.status) {
      case "QUEUED":
        progress = 5;
        break;
      case "PROCESSING":
        progress = 50;
        break;
      case "COMPLETED":
        progress = 100;
        break;
      case "FAILED":
      case "CANCELLED":
        progress = 0;
        break;
    }

    return {
      status: generation.status,
      progress,
      resultImageUrl: generation.resultImageUrl,
      errorMessage: generation.errorMessage,
    };
  }

  /**
   * Get all generations in a batch (multi-language).
   */
  async getBatch(batchId: string, userId: string) {
    const generations = await prisma.generation.findMany({
      where: { batchId, userId } as any,
      orderBy: { language: "asc" },
    });

    if (generations.length === 0) {
      throw new NotFoundError("Generation batch");
    }

    const completed = generations.filter((g) => g.status === "COMPLETED").length;
    const failed = generations.filter((g) => g.status === "FAILED").length;
    const total = generations.length;
    const progress = Math.round((completed / total) * 100);

    let batchStatus: string;
    if (completed === total) batchStatus = "COMPLETED";
    else if (failed === total) batchStatus = "FAILED";
    else if (completed + failed === total) batchStatus = "COMPLETED"; // partial success
    else batchStatus = "PROCESSING";

    return {
      batchId,
      status: batchStatus,
      progress,
      total,
      completed,
      failed,
      generations: generations.map((g) => this.formatResponse(g)),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────

  private async getCreditCost(tier: QualityTier): Promise<number> {
    const pricing = await prisma.modelPricing.findFirst({
      where: { qualityTier: tier, isActive: true },
      orderBy: { priority: "desc" },
      select: { creditCost: true },
    });

    return pricing?.creditCost ?? TIER_CONFIGS[tier].defaultCreditCost;
  }

  private computeGenerationHash(input: CreateGenerationInput): string {
    const hashInput = JSON.stringify({
      templateId: input.templateId,
      baseImageUrl: input.baseImageUrl,
      baseImageUrls: input.baseImageUrls,
      customUploadMode: input.customUploadMode,
      categoryId: input.categoryId,
      fieldValues: input.fieldValues,
      positionMap: input.positionMap,
      prompt: input.prompt,
      languages: input.languages,
      qualityTier: input.qualityTier,
      isPublic: input.isPublic,
    });
    return crypto.createHash("sha256").update(hashInput).digest("hex");
  }

  private async checkIdempotencyKey(
    key: string,
    input: CreateGenerationInput
  ) {
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");

    const existing = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (!existing) return null;

    if (existing.expiresAt < new Date()) {
      await prisma.idempotencyKey.delete({ where: { id: existing.id } });
      return null;
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        "Idempotency key already used with different request parameters"
      );
    }

    if (existing.generationId) {
      const generation = await prisma.generation.findUnique({
        where: { id: existing.generationId },
      });
      if (generation) return this.formatResponse(generation);
    }

    return null;
  }

  private async storeIdempotencyKey(
    key: string,
    input: CreateGenerationInput,
    generationId: string
  ): Promise<void> {
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");

    const expiresAt = new Date(Date.now() + IDEMPOTENCY.KEY_TTL_SECONDS * 1000);

    try {
      await prisma.idempotencyKey.create({
        data: {
          key,
          requestHash,
          generationId,
          expiresAt,
        },
      });
    } catch {
      // Key already exists (race condition) — safe to ignore
    }
  }

  private formatResponse(generation: Record<string, unknown>) {
    return {
      id: generation.id,
      batchId: generation.batchId ?? null,
      status: generation.status,
      qualityTier: generation.qualityTier,
      language: generation.language,
      contentType: generation.contentType,
      creditCost: generation.creditCost,
      isPublic: generation.isPublic ?? false,
      showcaseStatus: (generation as any).showcaseStatus ?? "NONE",
      orientation: generation.orientation ?? null,
      jobId: generation.jobId ?? null,
      resultImageUrl: generation.resultImageUrl ?? null,
      errorMessage: generation.errorMessage ?? null,
      processingMs: generation.processingMs ?? null,
      createdAt: generation.createdAt instanceof Date
        ? generation.createdAt.toISOString()
        : generation.createdAt,
    };
  }

  /**
   * Format a generation for the public feed — includes user name, category info.
   */
  private formatPublicResponse(generation: any) {
    const displayCategory = generation.showcaseCategory ?? generation.template?.category;
    return {
      id: generation.id,
      resultImageUrl: generation.resultImageUrl ?? null,
      contentType: generation.contentType,
      language: generation.language,
      qualityTier: generation.qualityTier,
      userName: generation.user?.name ?? "Anonymous",
      categoryName: displayCategory?.name ?? "Uncategorized",
      categoryId: displayCategory?.id ?? null,
      templateName: generation.template?.name ?? null,
      createdAt: generation.createdAt instanceof Date
        ? generation.createdAt.toISOString()
        : generation.createdAt,
    };
  }
}

export const generationService = new GenerationService();
