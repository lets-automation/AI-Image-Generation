import sharp from "sharp";
import { resizeToTarget } from "./resize.js";
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
 * Two generation paths (both using admin-configured model):
 *   1. /v1/images/generations — text-to-image (no reference images)
 *   2. /v1/images/edits       — image-to-image (with template/logo reference images)
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
    const size = this.deriveSize(input.width, input.height)
      ?? (input.params.size as string)
      ?? "1024x1024";

    const hasReferenceImages = !!(
      input.baseImageBuffer ||
      (input.logoBuffers && input.logoBuffers.length > 0) ||
      (input.sourceImageBuffers && input.sourceImageBuffers.length > 0)
    );

    if (hasReferenceImages) {
      // Image-to-image: /images/edits (multipart form data)
      return this.generateWithEdits(input, model, quality, size, apiKey);
    }

    // Text-to-image: /images/generations (JSON)
    return this.generateFromPrompt(input, model, quality, size, apiKey);
  }

  /**
   * Text-to-image via /v1/images/generations (JSON body).
   * Used when no reference images are provided.
   */
  private async generateFromPrompt(
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, quality, size }, "OpenAI: text-to-image via /images/generations");

    const body = {
      model,
      prompt: input.prompt,
      quality,
      size,
      n: 1,
      output_format: "png",
    };

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
      throw new Error(`OpenAI /images/generations error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as OpenAIImageResponse;
    return this.processResponse(data, input, model, quality, size, "text-to-image");
  }

  /**
   * Image-to-image via /v1/images/edits (multipart form data).
   * Used when template and/or logo reference images are provided.
   *
   * The /images/edits endpoint accepts:
   *   - image[]: one or more reference images (multipart file uploads)
   *   - prompt: text instructions
   *   - model, quality, size, n
   *
   * This replaces the old hardcoded gpt-4o Responses API path.
   * Now uses the admin-configured model (e.g. gpt-image-1.5).
   */
  private async generateWithEdits(
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, quality, size }, "OpenAI: image-to-image via /images/edits");

    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", input.prompt);
    formData.append("quality", quality);
    formData.append("size", size);
    formData.append("n", "1");

    // When multiple source images are provided (multi-image custom upload),
    // send each individually so the model can reason about each reference
    // (e.g., a product photographed from different angles).
    // Otherwise fall back to the single baseImageBuffer (template or collage).
    if (input.sourceImageBuffers && input.sourceImageBuffers.length > 1) {
      for (let i = 0; i < input.sourceImageBuffers.length; i++) {
        let imageBuffer = input.sourceImageBuffers[i];

        const meta = await sharp(imageBuffer).metadata();
        if (meta.width && meta.height && (meta.width > 4096 || meta.height > 4096)) {
          imageBuffer = await sharp(imageBuffer)
            .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        }

        formData.append(
          "image[]",
          new Blob([imageBuffer], { type: "image/png" }),
          `reference_${i + 1}.png`
        );
      }

      logger.info(
        { model, sourceImageCount: input.sourceImageBuffers.length },
        "OpenAI: appended individual source images as separate image[] entries"
      );
    } else if (input.baseImageBuffer) {
      // Single template/reference image (normal flow)
      let imageBuffer = input.baseImageBuffer;

      // Resize if too large for API limits
      const meta = await sharp(imageBuffer).metadata();
      if (meta.width && meta.height && (meta.width > 4096 || meta.height > 4096)) {
        imageBuffer = await sharp(imageBuffer)
          .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      }

      formData.append(
        "image[]",
        new Blob([imageBuffer], { type: "image/png" }),
        "template.png"
      );
    }

    // Add image-field buffers (logos, headshots, photos, etc.) as additional
    // reference images. Each gets its own image[] entry so the model can
    // reason about every one independently.
    if (input.logoBuffers && input.logoBuffers.length > 0) {
      for (let i = 0; i < input.logoBuffers.length; i++) {
        formData.append(
          "image[]",
          new Blob([input.logoBuffers[i]], { type: "image/png" }),
          `logo_${i + 1}.png`
        );
      }
    }

    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // No Content-Type — FormData sets it automatically with boundary
      },
      body: formData,
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenAI /images/edits error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as OpenAIImageResponse;
    return this.processResponse(data, input, model, quality, size, "image-to-image");
  }

  /**
   * Process the OpenAI response (shared by both endpoints).
   */
  private async processResponse(
    data: OpenAIImageResponse,
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    mode: string
  ): Promise<ProviderGenerateResult> {
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new Error("OpenAI returned no image data");
    }

    let outputBuffer: Buffer;

    if (imageData.b64_json) {
      outputBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      const imgResponse = await fetch(imageData.url, { signal: input.signal });
      if (!imgResponse.ok) {
        throw new Error(`Failed to download OpenAI generated image: ${imgResponse.status}`);
      }
      outputBuffer = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      throw new Error("OpenAI response contained no image data (no b64_json or url)");
    }

    const finalBuffer = await resizeToTarget(outputBuffer, input.width, input.height);

    const costCents = (input.params.costCents as number) ?? 8;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, quality, size, mode },
    };
  }

  /**
   * Derive OpenAI size parameter from pixel dimensions.
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

/** OpenAI Images API response shape */
interface OpenAIImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

export const openaiProvider = new OpenAIProvider();
