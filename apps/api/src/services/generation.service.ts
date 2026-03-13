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
import { TIER_CONFIGS, IDEMPOTENCY, ALL_LANGUAGES, type QualityTier } from "@ep/shared";
import { isTierSupported } from "../engine/router.js";
import { isTierAllowedByCostGuard, recordCreditRevenue } from "../resilience/cost-guard.js";
import { hasConflicts } from "../engine/layout/collision.js";
import { moderatePrompt, moderateFieldValue } from "../moderation/index.js";
import { auditService } from "./audit.service.js";
import { subscriptionService } from "./subscription.service.js";
import type { Position } from "@ep/shared";

// ─── Types ───────────────────────────────────────────────

interface CreateGenerationInput {
  userId: string;
  templateId?: string;
  baseImageUrl?: string;
  contentType: "EVENT" | "POSTER";
  categoryId: string;
  qualityTier: QualityTier;
  prompt: string;
  fieldValues: Record<string, string | number>;
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
      contentType,
      qualityTier,
      prompt,
      fieldValues,
      positionMap,
      idempotencyKey,
      languages,
      isPublic,
    } = input;

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

    for (const [key, value] of Object.entries(fieldValues)) {
      const fieldResult = moderateFieldValue(key, String(value));
      if (!fieldResult.allowed) {
        auditService.logModerationBlock(userId, fieldResult.category ?? "unknown", fieldResult.matchedPattern ?? "");
        throw new ModerationError(fieldResult.reason ?? "Field content blocked");
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
    } else if (!baseImageUrl) {
      throw new BadRequestError("Either templateId or baseImageUrl must be provided");
    }

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

    // 5. Get credit cost (charged ONCE for the entire batch of 10 languages)
    const creditCost = await this.getCreditCost(qualityTier);

    // 6. Generate a batchId to group all 10 language variants
    const batchId = uuidv4();

    // 7. Create Generation records for selected languages
    const generations = [];
    for (const lang of selectedLanguages) {
      const generationHash = this.computeGenerationHash({ ...input, languages: [lang] });
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
          creditCost: lang === selectedLanguages[0] ? creditCost : 0, // Only first lang carries cost
          templateVersion,
          baseImageUrl: baseImageUrl ?? null,
          generationHash,
          batchId,
          isPublic: isPublic ?? false,
        } as any,
      });
      generations.push(generation);
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

    // 9. Enqueue all 10 jobs
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
   * List all public generations with pagination and filters.
   */
  async listPublic(
    options: {
      page?: number;
      limit?: number;
      status?: string;
      contentType?: string;
    } = {}
  ) {
    const { page = 1, limit = 20, status, contentType } = options;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isPublic: true };
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
      orderBy: { priority: "asc" },
      select: { creditCost: true },
    });

    return pricing?.creditCost ?? TIER_CONFIGS[tier].defaultCreditCost;
  }

  private computeGenerationHash(input: CreateGenerationInput): string {
    const hashInput = JSON.stringify({
      templateId: input.templateId,
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
}

export const generationService = new GenerationService();
