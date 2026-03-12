import { createHash } from "crypto";

/**
 * Compute SHA256 hash of a string.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute generation cache key from inputs.
 */
export function computeGenerationHash(params: {
  templateId?: string;
  baseImageUrl?: string;
  fieldValues: Record<string, unknown>;
  positionMap: Record<string, unknown>;
  prompt: string;
  language: string;
  qualityTier: string;
}): string {
  const normalized = JSON.stringify({
    t: params.templateId ?? params.baseImageUrl,
    f: params.fieldValues,
    p: params.positionMap,
    pr: params.prompt,
    l: params.language,
    q: params.qualityTier,
  });
  return sha256(normalized);
}

/**
 * Sleep utility for delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
