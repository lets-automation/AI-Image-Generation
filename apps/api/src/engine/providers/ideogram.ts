import sharp from "sharp";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import {
  BaseProvider,
  type ProviderGenerateInput,
  type ProviderGenerateResult,
  type ProviderHealthStatus,
} from "./base.js";
import type { QualityTier } from "@ep/shared";

/**
 * Ideogram Provider
 *
 * Uses the Ideogram API to generate posters/creatives.
 * Ideogram is known for industry-leading text rendering accuracy,
 * making it ideal for posters with phone numbers, names, and multi-language text.
 *
 * All configuration (model, style, resolution) is DB-driven via ModelPricing.config.
 *
 * Admin configures model entries like:
 *   BASIC:    { model: "V_2_TURBO", style_type: "DESIGN", costCents: 4, image_weight: 35 }
 *   STANDARD: { model: "V_2",       style_type: "DESIGN", costCents: 6, image_weight: 30 }
 *   PREMIUM:  { model: "V_2",       style_type: "DESIGN", costCents: 8, image_weight: 30, resolution: "1024x1024" }
 *
 * When a template reference image is provided, the provider uses /remix
 * to generate a new poster matching the template's style.
 * Without reference images, it falls back to /generate.
 *
 * IMPORTANT: magic_prompt is set to OFF so our structured prompt (with precise
 * position grid, language rules, phone digit instructions) is sent verbatim.
 * image_weight defaults to 35 (not 80) so text placement takes priority over
 * style matching — the AI needs room to place text correctly.
 */
export class IdeogramProvider extends BaseProvider {
  readonly name = "ideogram";
  readonly displayName = "Ideogram";

  private readonly apiKey: string;
  private readonly baseUrl = "https://api.ideogram.ai";

  constructor() {
    super();
    this.apiKey = config.IDEOGRAM_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    if (!this.isConfigured()) {
      throw new Error("Ideogram API key not configured");
    }

    const model = (input.params.model as string) ?? "V_2";
    const styleType = (input.params.style_type as string) ?? "DESIGN";

    // Use /remix when we have a reference image (template)
    if (input.baseImageBuffer) {
      return this.generateWithRemix(input, model, styleType);
    }

    // Fallback: /generate (text-to-image only)
    return this.generateFromPrompt(input, model, styleType);
  }

  /**
   * Primary mode: /remix with reference image.
   *
   * Sends the template image as a style reference with the structured prompt.
   * Ideogram remix generates a new image inspired by the reference style
   * while following the prompt instructions for text and layout.
   */
  private async generateWithRemix(
    input: ProviderGenerateInput,
    model: string,
    styleType: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, styleType }, "Ideogram: generating via /remix with reference image");

    let imageBuffer = input.baseImageBuffer!;

    // Resize if too large (Ideogram accepts up to 2048x2048 for remix)
    const meta = await sharp(imageBuffer).metadata();
    if (meta.width && meta.height && (meta.width > 2048 || meta.height > 2048)) {
      imageBuffer = await sharp(imageBuffer)
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    }

    // Use the comprehensive structured prompt from prompt-builder.ts (passed as input.prompt)
    // which includes 3x3 position grid, language/translation rules, phone digit instructions,
    // and visual hierarchy. Do NOT use a simplified prompt — it produces garbled text.
    const finalPrompt = input.prompt;

    // Determine aspect ratio from dimensions
    const aspectRatio = this.getAspectRatio(input.width, input.height);

    // Build the image_request JSON
    const imageRequest: Record<string, unknown> = {
      prompt: finalPrompt,
      model,
      // OFF — our prompt is already structured and detailed. AUTO rewrites it,
      // mangling position/language/phone instructions and producing garbage text.
      magic_prompt_option: "OFF",
      style_type: styleType,
      aspect_ratio: aspectRatio,
      // Negative prompt: avoid common text rendering issues
      negative_prompt: "blurry text, garbled text, misspelled text, gibberish text, unreadable text, random characters, overlapping text, distorted letters, wrong language text, extra watermarks, duplicate text",
    };

    // Add resolution if specified in config
    const resolution = input.params.resolution as string | undefined;
    if (resolution) {
      imageRequest.resolution = resolution;
    }

    // Build multipart form data
    const formData = new FormData();
    formData.append("image_request", JSON.stringify(imageRequest));
    formData.append(
      "image_file",
      new Blob([imageBuffer], { type: "image/png" }),
      "template.png"
    );

    // Set image weight (how much to reference the original style, 0-100)
    // Lower values give the AI more freedom to place text correctly.
    // Default 35 (not 80) — high weight makes reference image dominate,
    // leaving no room for text placement and producing garbled results.
    // Admins can tune this per-tier via ModelPricing config.
    const imageWeight = (input.params.image_weight as number) ?? 35;
    formData.append("image_weight", String(imageWeight));

    const response = await fetch(`${this.baseUrl}/remix`, {
      method: "POST",
      headers: {
        "Api-Key": this.apiKey,
      },
      body: formData,
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Ideogram /remix API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as IdeogramResponse;
    const outputBuffer = await this.extractImageFromResponse(data, input.signal);

    // Resize to the requested output dimensions
    const finalBuffer = await sharp(outputBuffer)
      .resize(input.width, input.height, { fit: "fill" })
      .png()
      .toBuffer();

    const costCents = (input.params.costCents as number) ?? 6;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, styleType, aspectRatio, mode: "remix", provider: "ideogram" },
    };
  }

  /**
   * Fallback: /generate — text-to-image only (no reference image).
   */
  private async generateFromPrompt(
    input: ProviderGenerateInput,
    model: string,
    styleType: string
  ): Promise<ProviderGenerateResult> {
    logger.info({ model, styleType }, "Ideogram: text-to-image via /generate");

    const aspectRatio = this.getAspectRatio(input.width, input.height);

    const body: Record<string, unknown> = {
      image_request: {
        prompt: input.prompt,
        model,
        magic_prompt_option: "OFF",
        style_type: styleType,
        aspect_ratio: aspectRatio,
        negative_prompt: "blurry text, garbled text, misspelled text, gibberish text, unreadable text, random characters, overlapping text, distorted letters, wrong language text, extra watermarks, duplicate text",
      },
    };

    // Add resolution if specified
    const resolution = input.params.resolution as string | undefined;
    if (resolution) {
      (body.image_request as Record<string, unknown>).resolution = resolution;
    }

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Ideogram /generate API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as IdeogramResponse;
    const outputBuffer = await this.extractImageFromResponse(data, input.signal);

    const finalBuffer = await sharp(outputBuffer)
      .resize(input.width, input.height, { fit: "fill" })
      .png()
      .toBuffer();

    const costCents = (input.params.costCents as number) ?? 6;

    return {
      imageBuffer: finalBuffer,
      actualCostCents: costCents,
      metadata: { model, styleType, aspectRatio, mode: "generate", provider: "ideogram" },
    };
  }

  /**
   * Extract image buffer from Ideogram API response.
   * Ideogram returns image URLs in response.data[].url
   */
  private async extractImageFromResponse(
    data: IdeogramResponse,
    signal?: AbortSignal
  ): Promise<Buffer> {
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new Error("Ideogram returned no image data");
    }

    if (!imageData.url) {
      throw new Error("Ideogram response contained no image URL");
    }

    const imgResponse = await fetch(imageData.url, { signal });
    if (!imgResponse.ok) {
      throw new Error(`Failed to download Ideogram generated image: ${imgResponse.status}`);
    }

    return Buffer.from(await imgResponse.arrayBuffer());
  }

  /**
   * Map pixel dimensions to Ideogram aspect ratio enum.
   * Ideogram uses named aspect ratios instead of pixel sizes.
   */
  private getAspectRatio(width: number, height: number): string {
    const ratio = width / height;

    if (ratio >= 1.7) return "ASPECT_16_9";      // 16:9 landscape
    if (ratio >= 1.4) return "ASPECT_3_2";        // 3:2 landscape
    if (ratio >= 1.2) return "ASPECT_4_3";        // 4:3 landscape
    if (ratio >= 0.9) return "ASPECT_1_1";        // 1:1 square
    if (ratio >= 0.7) return "ASPECT_3_4";        // 3:4 portrait
    if (ratio >= 0.55) return "ASPECT_2_3";       // 2:3 portrait
    return "ASPECT_9_16";                         // 9:16 portrait
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) {
      return { healthy: false, latencyMs: 0, message: "API key not configured" };
    }

    const start = Date.now();
    try {
      // Ideogram doesn't have a dedicated health endpoint,
      // so we just check if the API responds with a valid error for empty request
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;

      // A 400/422 means the API is up (just rejected our empty request)
      // A 401 means bad API key
      // A 5xx means the API is down
      if (response.status === 401) {
        return { healthy: false, latencyMs, message: "Invalid API key" };
      }
      if (response.status >= 500) {
        return { healthy: false, latencyMs, message: `Server error ${response.status}` };
      }

      return {
        healthy: true,
        latencyMs,
        message: "OK",
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
    return (params.costCents as number) ?? 6;
  }
}

/** Ideogram API response shape */
interface IdeogramResponse {
  created: string;
  data: Array<{
    prompt: string;
    url: string;
    is_image_safe: boolean;
    seed: number;
    resolution?: string;
  }>;
}

export const ideogramProvider = new IdeogramProvider();
