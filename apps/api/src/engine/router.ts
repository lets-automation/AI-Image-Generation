import type { QualityTier } from "@ep/shared";

/**
 * Tier Router
 *
 * All tiers use AI generation. The template image is used as a style
 * reference — the AI generates a NEW poster matching the template's
 * style with text/logo artistically integrated.
 *
 * Tiers differ in:
 *   - AI model quality (configured by admin in ModelPricing DB table)
 *   - Output resolution
 *   - Credit cost
 *
 * Admin configures models via the admin UI:
 *   BASIC:    e.g. gpt-image-2 (low)     — fast, budget-friendly
 *   STANDARD: e.g. gpt-image-2 (medium)  — balanced quality
 *   PREMIUM:  e.g. gpt-image-2 (high)    — highest quality
 *
 * Legacy gpt-image-1 family (mini/1/1.5) is still supported for
 * existing DB-configured rows; quality tier mapping is unchanged.
 *
 * The overlay renderer is only used as an emergency fallback
 * when cost guard blocks all AI tiers.
 */

export type RendererType = "overlay" | "enhanced";

interface TierRoute {
  tier: QualityTier;
  renderer: RendererType;
  requiresAI: boolean;
  description: string;
}

const TIER_ROUTES: Record<QualityTier, TierRoute> = {
  BASIC: {
    tier: "BASIC",
    renderer: "enhanced",
    requiresAI: true,
    description: "AI-generated poster — fast, budget-friendly",
  },
  STANDARD: {
    tier: "STANDARD",
    renderer: "enhanced",
    requiresAI: true,
    description: "AI-generated poster — balanced quality & detail",
  },
  PREMIUM: {
    tier: "PREMIUM",
    renderer: "enhanced",
    requiresAI: true,
    description: "AI-generated poster — highest quality & artistic detail",
  },
};

/**
 * Check if a tier is currently supported.
 * All tiers are currently supported.
 */
export function isTierSupported(tier: QualityTier): boolean {
  return tier in TIER_ROUTES;
}
