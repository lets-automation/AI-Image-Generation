import { prisma } from "../config/database.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import {
  DEFAULT_VIDEO_CREDIT_COST_PER_15S,
  SEEDANCE_MAX_NATIVE_DURATION_SEC,
  SEEDANCE_PROVIDER_NAME,
  SEEDANCE_TIER_MAP,
  type VideoDuration,
} from "@ep/shared";
import type { QualityTier } from "@prisma/client";

// ─── Model Pricing ──────────────────────────────────────

interface CreateModelPricingInput {
  qualityTier: QualityTier;
  providerName: string;
  modelId: string;
  creditCost: number;
  priority?: number;
  config?: Record<string, unknown>;
}

interface UpdateModelPricingInput {
  creditCost?: number;
  isActive?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
}

export class PricingService {
  // ─── Model Pricing CRUD ─────────────────────────────────

  async listModelPricing(tier?: QualityTier) {
    return prisma.modelPricing.findMany({
      where: tier ? { qualityTier: tier } : {},
      orderBy: [{ qualityTier: "asc" }, { priority: "desc" }],
    });
  }

  async getModelPricing(id: string) {
    const pricing = await prisma.modelPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundError("Model pricing");
    return pricing;
  }

  async createModelPricing(input: CreateModelPricingInput) {
    // Check for unique constraint
    const existing = await prisma.modelPricing.findUnique({
      where: {
        qualityTier_providerName_modelId: {
          qualityTier: input.qualityTier,
          providerName: input.providerName,
          modelId: input.modelId,
        },
      },
    });
    if (existing) {
      throw new ConflictError(
        `Pricing already exists for ${input.providerName}/${input.modelId} at ${input.qualityTier} tier`
      );
    }

    return prisma.modelPricing.create({
      data: {
        qualityTier: input.qualityTier,
        providerName: input.providerName,
        modelId: input.modelId,
        creditCost: input.creditCost,
        priority: input.priority ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: (input.config ?? null) as any,
      },
    });
  }

  async updateModelPricing(id: string, input: UpdateModelPricingInput) {
    const pricing = await prisma.modelPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundError("Model pricing");

    return prisma.modelPricing.update({
      where: { id },
      data: {
        ...input,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: input.config !== undefined ? (input.config as any) : undefined,
      },
    });
  }

  async deleteModelPricing(id: string) {
    const pricing = await prisma.modelPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundError("Model pricing");
    await prisma.modelPricing.delete({ where: { id } });
  }

  /**
   * Get active model pricing for a specific tier, ordered by priority.
   */
  async getActivePricingForTier(tier: QualityTier) {
    return prisma.modelPricing.findMany({
      where: { qualityTier: tier, isActive: true },
      orderBy: { priority: "desc" },
    });
  }

  // ─── Video pricing ──────────────────────────────────────

  /**
   * Resolve the credit cost for a video generation.
   *
   * The Seedance ModelPricing row stores the per-15s credit cost for that
   * tier+variant. Longer durations (30 s) are billed linearly because the
   * pipeline runs N native clips end-to-end (one Seedance call per 15 s).
   *
   * Falls back to {@link DEFAULT_VIDEO_CREDIT_COST_PER_15S} when no row exists,
   * so video generation works out of the box before the admin seeds pricing.
   */
  async getVideoCreditCost(
    tier: QualityTier,
    durationSec: VideoDuration
  ): Promise<number> {
    const mapping = SEEDANCE_TIER_MAP[tier];
    const pricing = await prisma.modelPricing.findFirst({
      where: {
        qualityTier: tier,
        isActive: true,
        providerName: SEEDANCE_PROVIDER_NAME,
        modelId: mapping.modelId,
      },
      select: { creditCost: true },
    });

    const per15sCost =
      pricing?.creditCost ?? DEFAULT_VIDEO_CREDIT_COST_PER_15S[tier];
    const clipCount = Math.ceil(durationSec / SEEDANCE_MAX_NATIVE_DURATION_SEC);
    return per15sCost * clipCount;
  }
}

export const pricingService = new PricingService();
