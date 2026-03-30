import sharp from "sharp";
import { config } from "../../config/index.js";
import { credentialService } from "../../services/credential.service.js";
import { logger } from "../../utils/logger.js";
import {
  BaseProvider,
  type ProviderGenerateInput,
  type ProviderGenerateResult,
  type ProviderHealthStatus,
} from "./base.js";
import type { QualityTier } from "@ep/shared";

/**
 * OpenAI Provider
 *
 * Uses the OpenAI Images API to generate posters/creatives.
 * All configuration (model name, quality, size) is DB-driven via ModelPricing.config.
 *
 * The admin configures model entries like:
 *   BASIC:    { model: "gpt-image-1-mini",  quality: "low",    size: "1024x1024" }
 *   STANDARD: { model: "gpt-image-1",       quality: "medium", size: "1536x1024" }
 *   PREMIUM:  { model: "gpt-image-1.5",     quality: "high",   size: "1792x1024" }
 *
 * Generation flow (unified — one path for all cases):
 *   1. /v1/images/generations — text-to-image AND image-to-image
 *      gpt-image-1 and gpt-image-1.5 natively support reference images
 *      as base64 `image` parts in the request body.
 *
 * Fallback handling is done at the registry level via circuit breakers,
 * NOT via hardcoded model names inside this provider.
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI";

  private readonly baseUrl = "https://api.openai.com/v1";

  /** Fetch API key from DB first, fallback to env */
  private async getApiKey(): Promise<string> {
    return credentialService.getCredentialOrEnv("openai_api_key");
  }

  isConfigured(): boolean {
    // Sync check for registry — env key is always available for this
    return !!config.OPENAI_API_KEY;
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // All config comes from ModelPricing.config (DB) via params
    const model = (input.params.model as string) ?? "gpt-image-1";
    const quality = (input.params.quality as string) ?? "medium";
    // Size is derived from user-chosen orientation (via width/height passed from pipeline).
    // Falls back to admin config or default if orientation not set.
    const size = this.deriveSize(input.width, input.height)
      ?? (input.params.size as string)
      ?? "1024x1024";

    // Unified generation path — always uses /images/generations
    // Reference images (template/logo) are passed as base64 `image` parts
    return this.generateImage(input, model, quality, size, apiKey);
  }

  /**
   * Unified image generation via /v1/images/generations.
   *
   * gpt-image-1 and gpt-image-1.5 natively support reference images
   * as base64-encoded `image` entries in the request body. This replaces
   * the old multi-path approach (dall-e-2 edits / gpt-4o Responses API).
   *
   * When reference images are present, they are included as `image` array items.
   * When no reference images exist, only the prompt is sent (text-to-image).
   */
  private async generateImage(
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    const hasReferenceImages = !!(input.baseImageBuffer || input.logoBuffer);
    const mode = hasReferenceImages ? "image-to-image" : "text-to-image";

    logger.info({ model, quality, size, mode }, `OpenAI: generating via /images/generations (${mode})`);

    // Build request body
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      quality,
      size,
      n: 1,
      output_format: "png",
    };

    // Add reference images as base64 image entries when present
    if (hasReferenceImages) {
      const imageEntries: Array<{ type: string; image_url: string }> = [];

      if (input.baseImageBuffer) {
        let imageBuffer = input.baseImageBuffer;

        // Resize if too large for API limits
        const meta = await sharp(imageBuffer).metadata();
        if (meta.width && meta.height && (meta.width > 4096 || meta.height > 4096)) {
          imageBuffer = await sharp(imageBuffer)
            .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        }

        imageEntries.push({
          type: "base64",
          image_url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
        });
      }

      if (input.logoBuffer) {
        imageEntries.push({
          type: "base64",
          image_url: `data:image/png;base64,${input.logoBuffer.toString("base64")}`,
        });
      }

      body.image = imageEntries;
    }

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenAI images/generations API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      data: Array<{ b64_json?: string; url?: string }>;
    };

    const outputBuffer = await this.extractImageFromResponse(data, input.signal);

    const finalBuffer = await sharp(outputBuffer)
      .resize(input.width, input.height, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const costCents = (input.params.costCents as number) ?? 8;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, quality, size, mode },
    };
  }

  /**
   * Extract image buffer from OpenAI Images API response.
   * Handles both b64_json (inline) and url (download) formats.
   */
  private async extractImageFromResponse(
    data: { data: Array<{ b64_json?: string; url?: string }> },
    signal?: AbortSignal
  ): Promise<Buffer> {
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new Error("OpenAI returned no image data");
    }

    if (imageData.b64_json) {
      return Buffer.from(imageData.b64_json, "base64");
    }

    if (imageData.url) {
      const imgResponse = await fetch(imageData.url, { signal });
      if (!imgResponse.ok) {
        throw new Error(`Failed to download OpenAI generated image: ${imgResponse.status}`);
      }
      return Buffer.from(await imgResponse.arrayBuffer());
    }

    throw new Error("OpenAI response contained no image data (no b64_json or url)");
  }

  /**
   * Derive OpenAI size parameter from pixel dimensions.
   * Maps width/height to the closest supported OpenAI size string.
   */
  private deriveSize(width: number, height: number): string | null {
    if (!width || !height) return null;

    const targetRatio = width / height;
    const supportedSizes = [
      { size: "1024x1024", ratio: 1 },
      { size: "1024x1536", ratio: 2 / 3 },
      { size: "1536x1024", ratio: 3 / 2 },
    ];

    let best = supportedSizes[0];
    let smallestDiff = Math.abs(targetRatio - best.ratio);

    for (const candidate of supportedSizes.slice(1)) {
      const diff = Math.abs(targetRatio - candidate.ratio);
      if (diff < smallestDiff) {
        best = candidate;
        smallestDiff = diff;
      }
    }

    return best.size;
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) {
      return { healthy: false, latencyMs: 0, message: "API key not configured" };
    }

    const start = Date.now();
    try {
      const apiKey = await this.getApiKey();
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      return {
        healthy: response.ok,
        latencyMs,
        message: response.ok ? "OK" : `Status ${response.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Health check failed",
      };
    }
  }

  estimateCost(_tier: QualityTier, params: Record<string, unknown>): number {
    return (params.costCents as number) ?? 8;
  }
}

export const openaiProvider = new OpenAIProvider();
