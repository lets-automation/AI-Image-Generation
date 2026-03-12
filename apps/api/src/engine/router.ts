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
 *   BASIC:    e.g. gpt-image-1-mini   — fast, budget-friendly
 *   STANDARD: e.g. gpt-image-1        — balanced quality
 *   PREMIUM:  e.g. gpt-image-1.5      — highest quality
 *
 * The overlay renderer is only used as an emergency fallback
 * when cost guard blocks all AI tiers.
 */

export type RendererType = "overlay" | "enhanced";

export interface TierRoute {
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
 * Get the renderer route for a quality tier.
 */
export function getRouteForTier(tier: QualityTier): TierRoute {
  return TIER_ROUTES[tier];
}

/**
 * Check if a tier is currently supported.
 * All tiers are currently supported.
 */
export function isTierSupported(tier: QualityTier): boolean {
  return tier in TIER_ROUTES;
}
