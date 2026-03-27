import sharp from "sharp";
import type { Language, QualityTier } from "@ep/shared";
import type { OverlayField, OverlayOptions } from "./overlay.js";
import { getProviderForTier } from "../providers/registry.js";
import { recordProviderCost } from "../../resilience/cost-guard.js";
import { buildGenerationPrompt } from "../prompt-builder.js";
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
    fields,
    language,
    imageWidth,
    imageHeight,
    prompt,
    qualityTier = "STANDARD",
    signal,
    templateDescription,
  } = options;

  // Identify logo fields and non-logo (text) fields
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const hasLogo = logoFields.length > 0;

  // Step 1: Build the structured 4-section prompt
  const structuredPrompt = buildGenerationPrompt({
    userPrompt: prompt,
    fields,
    language,
    templateDescription,
    hasLogo,
  });

  // Step 2: Load the clean template image (style reference — no overlay)
  let templateBuffer: Buffer | undefined = baseImageBuffer;
  if (!templateBuffer) {
    const response = await fetch(baseImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch template image: ${response.status}`);
    }
    templateBuffer = Buffer.from(await response.arrayBuffer());
  }

  // Step 3: Load logo image buffer (if any logo field has a URL)
  let logoBuffer: Buffer | undefined;
  for (const logoField of logoFields) {
    const logoUrl = logoField.value;
    if (!logoUrl || logoUrl.startsWith("blob:")) continue;
    try {
      const logoResponse = await fetch(logoUrl);
      if (logoResponse.ok) {
        const rawLogo = Buffer.from(await logoResponse.arrayBuffer());
        // Ensure logo is PNG for API compatibility
        logoBuffer = await sharp(rawLogo).png().toBuffer();
        break; // Use the first valid logo
      }
    } catch (err) {
      logger.warn({ logoUrl, err }, "Failed to fetch logo image, proceeding without logo");
    }
  }

  // Step 4: Send template + logo + structured prompt to AI provider
  try {
    const resolved = await getProviderForTier(qualityTier as QualityTier);

    logger.info(
      { provider: resolved.provider.name, modelId: resolved.modelId, tier: qualityTier },
      "Enhanced renderer: sending template + prompt to AI for poster generation"
    );

    if (resolved.circuitBreaker.getState() === "HALF_OPEN") {
      resolved.circuitBreaker.onHalfOpenAttempt();
    }

    const aiResult = await resolved.provider.generate({
      prompt: structuredPrompt,
      baseImageBuffer: templateBuffer,
      logoBuffer,
      width: imageWidth,
      height: imageHeight,
      params: {
        ...resolved.config,
        model: resolved.config.model ?? resolved.modelId,
        tier: qualityTier,
      },
      rawOptions: {
        userPrompt: prompt,
        fields,
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
