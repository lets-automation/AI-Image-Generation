export const QualityTier = {
  BASIC: "BASIC",
  STANDARD: "STANDARD",
  PREMIUM: "PREMIUM",
} as const;

export type QualityTier = (typeof QualityTier)[keyof typeof QualityTier];

export interface TierConfig {
  code: QualityTier;
  label: string;
  description: string;
  jobTimeoutMs: number;
  defaultCreditCost: number;
}

export const TIER_CONFIGS: Record<QualityTier, TierConfig> = {
  BASIC: {
    code: "BASIC",
    label: "Basic",
    description: "Fast AI generation — simple but professional posters",
    jobTimeoutMs: 120_000,
    defaultCreditCost: 5,
  },
  STANDARD: {
    code: "STANDARD",
    label: "Standard",
    description: "Balanced AI generation — better design & typography",
    jobTimeoutMs: 120_000,
    defaultCreditCost: 15,
  },
  PREMIUM: {
    code: "PREMIUM",
    label: "Premium",
    description: "Highest quality AI — artistic visuals & premium detail",
    jobTimeoutMs: 180_000,
    defaultCreditCost: 30,
  },
};

export const ALL_TIERS = Object.values(QualityTier);
