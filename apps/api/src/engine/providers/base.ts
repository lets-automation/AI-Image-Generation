import type { QualityTier } from "@ep/shared";

/**
 * Abstract base class for AI image generation providers.
 *
 * Each provider extends this class and implements the generate(),
 * healthCheck(), and estimateCost() methods.
 *
 * New providers can be added by:
 * 1. Creating a class extending BaseProvider in this directory
 * 2. Registering it in registry.ts PROVIDERS map
 * 3. Adding the API key to .env and config/index.ts
 * 4. Creating ModelPricing entries via the admin UI
 */

export interface ProviderGenerateInput {
  prompt: string;
  /** System-level instruction for providers that support it (e.g., Gemini systemInstruction) */
  systemInstruction?: string;
  /** Base/template image buffer — used as style reference for the AI */
  baseImageBuffer?: Buffer;
  /** Logo image buffer — passed as additional reference image to the AI */
  logoBuffer?: Buffer;
  /**
   * Individual source image buffers from multi-image custom uploads.
   * When provided, OpenAI/Gemini send these as separate reference images
   * instead of the single collage in baseImageBuffer.
   * Ideogram ignores this (uses baseImageBuffer collage — API only accepts 1 image).
   */
  sourceImageBuffers?: Buffer[];
  width: number;
  height: number;
  /** Provider-specific parameters from ModelPricing.config (DB-driven) */
  params: Record<string, unknown>;
  /** Raw fields and metadata for providers that construct their own prompts natively */
  rawOptions?: {
    userPrompt: string;
    fields: import("../renderers/overlay.js").OverlayField[];
    language: import("@ep/shared").Language;
    templateDescription?: string;
  };
  /** AbortSignal for timeout enforcement */
  signal?: AbortSignal;
}

export interface ProviderGenerateResult {
  /** Generated image as a Buffer */
  imageBuffer: Buffer;
  /** Actual cost incurred (in provider's unit, e.g., cents) */
  actualCostCents: number;
  /** Provider-specific metadata */
  metadata: Record<string, unknown>;
}

export interface ProviderHealthStatus {
  healthy: boolean;
  latencyMs: number;
  message?: string;
}

export abstract class BaseProvider {
  /** Provider identifier, e.g., "openai" */
  abstract readonly name: string;

  /** Display name for admin UI */
  abstract readonly displayName: string;

  /** Whether this provider is configured (API key present) */
  abstract isConfigured(): boolean;

  /**
   * Generate an image using this provider's API.
   * Must handle its own error reporting and throw on failure.
   */
  abstract generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult>;

  /**
   * Quick health check — verify API connectivity.
   * Should complete in < 5 seconds.
   */
  abstract healthCheck(): Promise<ProviderHealthStatus>;

  /**
   * Estimate the cost of a generation in cents (USD).
   * Used by the CostGuard to enforce daily spend limits.
   */
  abstract estimateCost(
    tier: QualityTier,
    params: Record<string, unknown>
  ): number;
}
