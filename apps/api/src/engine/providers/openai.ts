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
 * When reference images (template/logo) are provided, the provider uses
 * /v1/images/edits to pass them as style references.
 * Without reference images, it falls back to /v1/images/generations.
 *
 * The AI generates a NEW poster matching the template's style,
 * with text and logo artistically integrated — not a simple overlay.
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

    try {
      if (model === "dall-e-2" && (input.baseImageBuffer || input.logoBuffer)) {
        // dall-e-2 supports image reference via /images/edits
        return this.generateWithEdits(input, model, quality, size, apiKey);
      }

      if (input.baseImageBuffer || input.logoBuffer) {
        // gpt-image-* with reference images → Responses API (correct img2img path)
        return this.generateWithResponsesAPI(input, quality, size, apiKey);
      }

      // Text-to-image only (no reference images)
      return this.generateFromPrompt(input, model, quality, size, apiKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const fallbackModel = "gpt-image-1";
      const canFallback =
        model !== fallbackModel &&
        this.isInvalidModelError(message);

      if (!canFallback) {
        throw err;
      }

      logger.warn(
        { configuredModel: model, fallbackModel, reason: message },
        "OpenAI model unavailable, retrying with fallback model"
      );

      return this.generateFromPrompt(input, fallbackModel, quality, size, apiKey);
    }
  }

  private isInvalidModelError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes("model") &&
      (lower.includes("not found") ||
        lower.includes("does not exist") ||
        lower.includes("invalid") ||
        lower.includes("unsupported"))
    );
  }

  /**
   * Primary mode: /v1/images/edits with reference images.
   *
   * Sends:
   * - The template image as the primary reference (style guide)
   * - The logo image as secondary reference (if provided)
   * - A structured prompt describing exactly what to generate
   *
   * The AI creates a new poster matching the template's style
   * with text/logo naturally integrated into the design.
   */
  private async generateWithEdits(
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, quality, size }, "OpenAI: generating via /images/edits with reference images");

    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", input.prompt);
    formData.append("size", size);
    formData.append("n", "1");
    formData.append("response_format", "b64_json");

    // Add template image as primary reference
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

      formData.append(
        "image[]",
        new Blob([imageBuffer], { type: "image/png" }),
        "template.png"
      );
    }

    // Add logo image as secondary reference
    if (input.logoBuffer) {
      formData.append(
        "image[]",
        new Blob([input.logoBuffer], { type: "image/png" }),
        "logo.png"
      );
    }

    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenAI images/edits API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      data: Array<{ b64_json?: string; url?: string }>;
    };

    const outputBuffer = await this.extractImageFromResponse(data, input.signal);

    // Resize to the requested output dimensions
    const finalBuffer = await sharp(outputBuffer)
      .resize(input.width, input.height, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    // Cost estimation from DB config or default
    const costCents = (input.params.costCents as number) ?? 8;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, quality, size, mode: "edits" },
    };
  }

  /**
   * Image-to-image for gpt-image-* models via the Responses API.
   *
   * /images/edits only supports dall-e-2. For gpt-image-1 and newer models,
   * image inputs (style reference, product photo) must be passed via
   * POST /v1/responses with tools: [{ type: "image_generation" }].
   *
   * The vision-capable model (gpt-4o) understands the reference image,
   * then the image_generation tool produces the final poster.
   */
  private async generateWithResponsesAPI(
    input: ProviderGenerateInput,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ quality, size }, "OpenAI: generating via Responses API with image reference");

    type ContentPart =
      | { type: "input_image"; image_url: string }
      | { type: "input_text"; text: string };

    const content: ContentPart[] = [];

    // Add template / product photo as primary reference
    if (input.baseImageBuffer) {
      let imageBuffer = input.baseImageBuffer;
      const meta = await sharp(imageBuffer).metadata();
      if (meta.width && meta.height && (meta.width > 2048 || meta.height > 2048)) {
        imageBuffer = await sharp(imageBuffer)
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      }
      content.push({
        type: "input_image",
        image_url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      });
    }

    // Add logo as secondary reference
    if (input.logoBuffer) {
      content.push({
        type: "input_image",
        image_url: `data:image/png;base64,${input.logoBuffer.toString("base64")}`,
      });
    }

    content.push({ type: "input_text", text: input.prompt });

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{ role: "user", content }],
        tools: [{ type: "image_generation", quality, size, output_format: "png" }],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenAI Responses API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      output: Array<{ type: string; result?: string }>;
    };

    const imageOutput = data.output?.find((o) => o.type === "image_generation_call");
    if (!imageOutput?.result) {
      throw new Error("OpenAI Responses API returned no image data");
    }

    const outputBuffer = Buffer.from(imageOutput.result, "base64");
    const finalBuffer = await sharp(outputBuffer)
      .resize(input.width, input.height, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const costCents = (input.params.costCents as number) ?? 8;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model: "gpt-4o+image_generation", quality, size, mode: "responses_api" },
    };
  }

  /**
   * Fallback: /v1/images/generations — text-to-image only (no reference images).
   * Used when no template or logo is provided.
   */
  private async generateFromPrompt(
    input: ProviderGenerateInput,
    model: string,
    quality: string,
    size: string,
    apiKey: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, quality, size }, "OpenAI: text-to-image via /images/generations");

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        quality,
        size,
        n: 1,
        output_format: "png",
      }),
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
      metadata: { model, quality, size, mode: "generation" },
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
