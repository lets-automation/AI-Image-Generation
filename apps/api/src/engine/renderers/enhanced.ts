import sharp from "sharp";
import type { Language, QualityTier } from "@ep/shared";
import type { OverlayField, OverlayOptions } from "./overlay.js";
import { getProviderForTier } from "../providers/registry.js";
import { recordProviderCost } from "../../resilience/cost-guard.js";
import { buildGenerationPrompt, buildIdeogramPrompt, buildGeminiPrompt } from "../prompt-builder.js";
import { logger } from "../../utils/logger.js";

/**
 * Enhanced Renderer (used by ALL tiers)
 *
 * This is the core AI generation renderer. It does NOT overlay text onto
 * the template. Instead it:
 *
 * 1. Builds a structured 4-section prompt from user fields + template description
 * 2. Sends the CLEAN template image as a style reference to the AI
 * 3. Sends the logo image (if any) as a secondary reference
 * 4. AI generates a NEW poster matching the template's style,
 *    with text/logo artistically integrated into the scene
 *
 * Fallback: If AI fails, falls back to local overlay renderer (text compositing)
 *
 * The template image acts as a STYLE REFERENCE, not a base for compositing.
 * Example: if template shows a wooden sign in a forest,
 * the AI will place the business name ON the wooden board.
 */

export interface EnhancedOptions {
  baseImageUrl: string;
  baseImageBuffer?: Buffer;
  /**
   * Individual source image buffers from multi-image custom uploads.
   * Passed to providers that support multiple reference images natively.
   */
  sourceImageBuffers?: Buffer[];
  safeZones: OverlayOptions["safeZones"];
  fields: OverlayField[];
  language: Language;
  imageWidth: number;
  imageHeight: number;
  prompt: string;
  /** Quality tier — determines which AI model/provider to use (from DB) */
  qualityTier?: QualityTier;
  /** AbortSignal for timeout enforcement */
  signal?: AbortSignal;
  /** Template description from admin — used in prompt */
  templateDescription?: string;
}

export interface EnhancedResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: "png";
  providerUsed: string;
  aiCostCents: number;
}

export async function renderEnhanced(
  options: EnhancedOptions
): Promise<EnhancedResult> {
  const {
    baseImageUrl,
    baseImageBuffer,
    sourceImageBuffers,
    fields,
    language,
    imageWidth,
    imageHeight,
    prompt,
    qualityTier = "STANDARD",
    signal,
    templateDescription,
  } = options;

  // Identify image-type fields (logos, headshots, photos, etc.) and text fields
  const imageFields = fields.filter((f) => f.fieldType === "IMAGE");
  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");

  // Step 1: Load the clean template image (style reference — no overlay)
  let templateBuffer: Buffer | undefined = baseImageBuffer;
  if (!templateBuffer) {
    const response = await fetch(baseImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch template image: ${response.status}`);
    }
    templateBuffer = Buffer.from(await response.arrayBuffer());
  }

  // Step 2: Load every image-field buffer in parallel. Drop any field whose
  // URL is missing/unfetchable so the prompt only describes images we
  // actually send to the provider — keeps prompt and buffers in lockstep.
  const fetchResults = await Promise.all(
    imageFields.map(async (field) => {
      const url = field.value;
      if (!url || url.startsWith("blob:")) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          logger.warn(
            { url, status: res.status, fieldKey: field.fieldKey },
            "Image-field fetch returned non-OK, skipping"
          );
          return null;
        }
        const raw = Buffer.from(await res.arrayBuffer());
        const png = await sharp(raw).png().toBuffer();
        return { field, buffer: png };
      } catch (err) {
        logger.warn(
          { url, err, fieldKey: field.fieldKey },
          "Failed to fetch image-field URL, skipping"
        );
        return null;
      }
    })
  );

  const validImageFields: OverlayField[] = [];
  const logoBuffers: Buffer[] = [];
  for (const r of fetchResults) {
    if (r) {
      validImageFields.push(r.field);
      logoBuffers.push(r.buffer);
    }
  }

  // Effective field set: keep all text fields, replace image fields with the
  // subset we successfully fetched. The prompt builder will describe these
  // in the same order the provider receives the buffers.
  const effectiveFields: OverlayField[] = [...textFields, ...validImageFields];
  const hasLogo = validImageFields.length > 0;

  // Step 4: Send template + logo + prompt to AI provider
  try {
    const resolved = await getProviderForTier(qualityTier as QualityTier);

    // Build provider-specific prompt:
    // - OpenAI: full structured prompt with section headers (handles them well)
    // - Gemini: split into systemInstruction + userContent (leverages Gemini's architecture)
    // - Ideogram: concise natural-language prompt (can't handle structured formatting)
    const sourceImageCount = sourceImageBuffers?.length ?? 0;
    const promptInput = {
      userPrompt: prompt,
      fields: effectiveFields,
      language,
      templateDescription,
      hasLogo,
      sourceImageCount,
    };

    let aiPrompt: string;
    let aiSystemInstruction: string | undefined;

    if (resolved.provider.name === "gemini") {
      const geminiParts = buildGeminiPrompt(promptInput);
      aiPrompt = geminiParts.userContent;
      aiSystemInstruction = geminiParts.systemInstruction;
    } else if (resolved.provider.name === "openai") {
      aiPrompt = buildGenerationPrompt(promptInput);
    } else {
      aiPrompt = buildIdeogramPrompt(promptInput);
    }

    logger.info(
      { provider: resolved.provider.name, modelId: resolved.modelId, tier: qualityTier, promptLength: aiPrompt.length },
      "Enhanced renderer: sending template + prompt to AI for poster generation"
    );

    if (resolved.circuitBreaker.getState() === "HALF_OPEN") {
      resolved.circuitBreaker.onHalfOpenAttempt();
    }

    const aiResult = await resolved.provider.generate({
      prompt: aiPrompt,
      systemInstruction: aiSystemInstruction,
      baseImageBuffer: templateBuffer,
      logoBuffers: logoBuffers.length > 0 ? logoBuffers : undefined,
      sourceImageBuffers,
      width: imageWidth,
      height: imageHeight,
      params: {
        ...resolved.config,
        model: resolved.config.model ?? resolved.modelId,
        tier: qualityTier,
      },
      rawOptions: {
        userPrompt: prompt,
        fields: effectiveFields,
        language,
        templateDescription,
      },
      signal,
    });

    // Record success
    resolved.circuitBreaker.onSuccess();
    await recordProviderCost(aiResult.actualCostCents);

    return {
      buffer: aiResult.imageBuffer,
      width: imageWidth,
      height: imageHeight,
      format: "png",
      providerUsed: resolved.provider.name,
      aiCostCents: aiResult.actualCostCents,
    };
  } catch (err) {
    // Record failure for circuit breaker
    if (err instanceof Error && !err.message.includes("unavailable")) {
      try {
        const resolved = await getProviderForTier(qualityTier as QualityTier);
        resolved.circuitBreaker.onFailure();
      } catch {
        // Provider still unavailable
      }
    }
    logger.error({ err }, "Enhanced renderer: AI generation failed");
    throw err;
  }
}
