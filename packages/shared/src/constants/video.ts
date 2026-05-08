/**
 * Video generation constants.
 *
 * Provider: ByteDance Seedance 2.0 via BytePlus ModelArk.
 * Native single-call duration is capped at 15 s; longer outputs are produced
 * by stitching multiple 15 s clips with last-frame conditioning.
 */

import { QualityTier } from "./tiers.js";

// ─── Job type discriminator on the Generation model ─────────

export const JobType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

// ─── User-facing duration / resolution options ──────────────

export const VIDEO_DURATIONS = [15, 30] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

/**
 * Max reference images Seedance accepts on a single image-to-video call.
 * The first image is treated as the conditioning first frame; the rest act
 * as style / character references ("omni-reference" mode).
 *
 * Native cap is 9 per BytePlus ModelArk docs.
 */
export const MAX_VIDEO_REFERENCE_IMAGES = 9;

/** Stored verbatim in `Generation.videoResolution`. */
export const VIDEO_RESOLUTIONS = ["P720", "P1080"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

// ─── Seedance variant + per-tier mapping ────────────────────

export const SEEDANCE_PROVIDER_NAME = "seedance";

/** Native maximum duration for a single Seedance generation call. */
export const SEEDANCE_MAX_NATIVE_DURATION_SEC = 15;

export type SeedanceVariant = "fast" | "pro";

export interface SeedanceTierMapping {
  variant: SeedanceVariant;
  /** BytePlus ModelArk model ID. */
  modelId: string;
  resolution: VideoResolution;
  resolutionLabel: "720p" | "1080p";
  /** USD price per output second — used by cost-guard accounting only. */
  costPerSecondUsd: number;
}

/**
 * Maps user-facing quality tiers to Seedance variant + resolution.
 * BASIC    → Fast 720p ($0.16/s)
 * STANDARD → Pro  720p ($0.20/s)
 * PREMIUM  → Pro 1080p ($0.50/s)
 *
 * Model IDs use the BytePlus ModelArk naming (`dreamina-` prefix). The
 * China-region Volcengine ARK uses the same model under the `doubao-` prefix
 * — switch via the SEEDANCE_BASE_URL env var alongside re-mapping the IDs.
 */
export const SEEDANCE_TIER_MAP: Record<QualityTier, SeedanceTierMapping> = {
  BASIC: {
    variant: "fast",
    modelId: "dreamina-seedance-2-0-fast-260128",
    resolution: "P720",
    resolutionLabel: "720p",
    costPerSecondUsd: 0.16,
  },
  STANDARD: {
    variant: "pro",
    modelId: "dreamina-seedance-2-0-260128",
    resolution: "P720",
    resolutionLabel: "720p",
    costPerSecondUsd: 0.20,
  },
  PREMIUM: {
    variant: "pro",
    modelId: "dreamina-seedance-2-0-260128",
    resolution: "P1080",
    resolutionLabel: "1080p",
    costPerSecondUsd: 0.50,
  },
};

// ─── Default credit costs (admin can override via ModelPricing) ──

/**
 * Per-15s default credit cost per tier. The pricing service reads
 * ModelPricing rows for Seedance first; these defaults apply when no
 * row exists yet. 30 s is billed as 2 × the 15 s cost (linear), since
 * the pipeline runs two clips end-to-end.
 */
export const DEFAULT_VIDEO_CREDIT_COST_PER_15S: Record<QualityTier, number> = {
  BASIC: 25,
  STANDARD: 30,
  PREMIUM: 75,
};

// ─── UI tier labels ──────────────────────────────────────────

export interface VideoTierConfig {
  code: QualityTier;
  label: string;
  description: string;
  resolution: "720p" | "1080p";
  variant: "Fast" | "Pro";
}

export const VIDEO_TIER_CONFIGS: Record<QualityTier, VideoTierConfig> = {
  BASIC: {
    code: "BASIC",
    label: "Basic",
    description: "Seedance Fast — 720p, fastest generation",
    resolution: "720p",
    variant: "Fast",
  },
  STANDARD: {
    code: "STANDARD",
    label: "Standard",
    description: "Seedance Pro — 720p, balanced quality",
    resolution: "720p",
    variant: "Pro",
  },
  PREMIUM: {
    code: "PREMIUM",
    label: "Premium",
    description: "Seedance Pro — 1080p, highest quality",
    resolution: "1080p",
    variant: "Pro",
  },
};

/**
 * Per-job timeout for the video pipeline.
 * 30 s output ≈ 2 clips × ~120 s Seedance latency + ffmpeg stitch + Cloudinary upload.
 * Set generously to absorb worst-case provider latency without false-failing jobs.
 */
export const VIDEO_JOB_TIMEOUT_MS = 600_000; // 10 min
