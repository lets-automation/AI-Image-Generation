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
 * Google Gemini Provider (Nano Banana)
 *
 * Uses the Gemini REST API to generate images via `generateContent`
 * with `responseModalities: ["IMAGE"]`.
 *
 * All configuration (model, quality) is DB-driven via ModelPricing.config.
 *
 * Admin configures model entries like:
 *   BASIC:    { model: "gemini-2.5-flash-image",           costCents: 3 }
 *   STANDARD: { model: "gemini-3.1-flash-image-preview",    costCents: 5 }
 *   PREMIUM:  { model: "gemini-3-pro-image-preview",        costCents: 10 }
 *
 * Gemini natively supports multimodal input: reference images are passed
 * as inline base64 data parts alongside the text prompt.
 */
export class GeminiProvider extends BaseProvider {
  readonly name = "gemini";
  readonly displayName = "Google Gemini";

  private readonly baseUrl =
    "https://generativelanguage.googleapis.com/v1beta";

  /** Fetch API key from DB first, fallback to env */
  private async getApiKey(): Promise<string> {
    return credentialService.getCredentialOrEnv("gemini_api_key");
  }

  isConfigured(): boolean {
    return !!config.GEMINI_API_KEY;
  }

  async generate(
    input: ProviderGenerateInput
  ): Promise<ProviderGenerateResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }

    const model =
      (input.params.model as string) ??
      "gemini-2.5-flash-image";

    const hasReferenceImages = !!(
      input.baseImageBuffer ||
      (input.logoBuffers && input.logoBuffers.length > 0) ||
      (input.sourceImageBuffers && input.sourceImageBuffers.length > 0)
    );
    const mode = hasReferenceImages ? "image-to-image" : "text-to-image";

    logger.info(
      { model, mode },
      `Gemini: generating via generateContent (${mode})`
    );

    // Build multimodal content parts
    type ContentPart =
      | { text: string }
      | { inlineData: { mimeType: string; data: string } };

    const parts: ContentPart[] = [];

    // When multiple source images are provided (multi-image custom upload),
    // send each individually so the model can reason about each reference
    // (e.g., a product photographed from different angles).
    // Otherwise fall back to the single baseImageBuffer (template or collage).
    if (input.sourceImageBuffers && input.sourceImageBuffers.length > 1) {
      for (let i = 0; i < input.sourceImageBuffers.length; i++) {
        let imageBuffer = input.sourceImageBuffers[i];
        const meta = await sharp(imageBuffer).metadata();
        if (
          meta.width &&
          meta.height &&
          (meta.width > 4096 || meta.height > 4096)
        ) {
          imageBuffer = await sharp(imageBuffer)
            .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        }
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: imageBuffer.toString("base64"),
          },
        });
      }

      logger.info(
        { model, sourceImageCount: input.sourceImageBuffers.length },
        "Gemini: appended individual source images as separate inlineData parts"
      );
    } else if (input.baseImageBuffer) {
      // Single template/reference image (normal flow)
      let imageBuffer = input.baseImageBuffer;
      const meta = await sharp(imageBuffer).metadata();
      if (
        meta.width &&
        meta.height &&
        (meta.width > 4096 || meta.height > 4096)
      ) {
        imageBuffer = await sharp(imageBuffer)
          .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      }
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: imageBuffer.toString("base64"),
        },
      });
    }

    if (input.logoBuffers && input.logoBuffers.length > 0) {
      for (const logoBuf of input.logoBuffers) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: logoBuf.toString("base64"),
          },
        });
      }
    }

    // Add text prompt — prepend aspect ratio guidance since Gemini has no
    // native size parameter for image generation
    const aspectHint = this.getAspectHint(input.width, input.height);
    const fullPrompt = aspectHint
      ? `${aspectHint}\n\n${input.prompt}`
      : input.prompt;
    parts.push({ text: fullPrompt });

    // Build the request body — with systemInstruction if provided
    const requestBody: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        // TEXT + IMAGE allows the model to reason about the instructions before
        // generating, producing better adherence to the prompt.
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    // Use Gemini's dedicated systemInstruction field for rules/constraints.
    // System instructions are processed with higher attention weight than user content.
    if (input.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: input.systemInstruction }],
      };
    }

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Gemini generateContent API error ${response.status}: ${errorBody}`
      );
    }

    const data = (await response.json()) as GeminiResponse;

    // Extract the generated image from the response
    const outputBuffer = this.extractImageFromResponse(data);

    // Resize to the requested output dimensions using smart resize (no crop)
    const finalBuffer = await resizeToTarget(outputBuffer, input.width, input.height);

    const costCents = (input.params.costCents as number) ?? 5;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, mode, provider: "gemini" },
    };
  }

  /**
   * Extract the generated image buffer from Gemini's response.
   * Gemini returns images as inlineData parts within candidates.
   */
  private extractImageFromResponse(data: GeminiResponse): Buffer {
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("Gemini returned no candidates");
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("Gemini candidate has no content parts");
    }

    // Find the image part (inlineData with image/* mimeType)
    for (const part of parts) {
      if (
        part.inlineData &&
        part.inlineData.mimeType?.startsWith("image/")
      ) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }

    throw new Error(
      "Gemini response contained no image data in candidate parts"
    );
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) {
      return {
        healthy: false,
        latencyMs: 0,
        message: "API key not configured",
      };
    }

    const start = Date.now();
    try {
      const apiKey = await this.getApiKey();
      // Check API key validity by listing available models
      const response = await fetch(
        `${this.baseUrl}/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const latencyMs = Date.now() - start;

      if (response.status === 401 || response.status === 403) {
        return {
          healthy: false,
          latencyMs,
          message: "Invalid API key",
        };
      }

      return {
        healthy: response.ok,
        latencyMs,
        message: response.ok ? "OK" : `Status ${response.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message:
          err instanceof Error ? err.message : "Health check failed",
      };
    }
  }

  estimateCost(
    _tier: QualityTier,
    params: Record<string, unknown>
  ): number {
    return (params.costCents as number) ?? 5;
  }

  /**
   * Generate a natural-language aspect ratio hint for the prompt.
   * Gemini's generateContent doesn't have a native size/aspect parameter,
   * so we guide it via text.
   */
  private getAspectHint(width: number, height: number): string | null {
    if (!width || !height) return null;
    const ratio = width / height;

    if (Math.abs(ratio - 1) < 0.05) return "Generate this image in a square (1:1) aspect ratio.";
    if (Math.abs(ratio - 9 / 16) < 0.05) return "Generate this image in a tall portrait (9:16) aspect ratio, suitable for stories.";
    if (Math.abs(ratio - 3 / 4) < 0.05) return "Generate this image in portrait (3:4) aspect ratio.";
    if (Math.abs(ratio - 4 / 3) < 0.05) return "Generate this image in landscape (4:3) aspect ratio.";
    if (Math.abs(ratio - 16 / 9) < 0.05) return "Generate this image in wide landscape (16:9) aspect ratio.";
    if (ratio < 0.8) return `Generate this image in a tall portrait aspect ratio (approximately ${width}:${height}).`;
    if (ratio > 1.2) return `Generate this image in a wide landscape aspect ratio (approximately ${width}:${height}).`;
    return null;
  }
}

/** Gemini generateContent response shape */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
      role: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: Record<string, unknown>;
}

export const geminiProvider = new GeminiProvider();
