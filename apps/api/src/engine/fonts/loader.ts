import fs from "fs";
import { GlobalFonts } from "@napi-rs/canvas";
import type { Language } from "@ep/shared";
import { getFontEntry, getAssetsDir, getRequiredFontFiles } from "./registry.js";
import { logger } from "../../utils/logger.js";

let fontsLoaded = false;
const registeredFamilies = new Set<string>();

/**
 * Register all available Noto Sans font files with @napi-rs/canvas.
 * Silently skips missing font files (logs warning).
 * Idempotent — safe to call multiple times.
 */
export function loadAllFonts(): void {
  if (fontsLoaded) return;

  const assetsDir = getAssetsDir();
  if (!fs.existsSync(assetsDir)) {
    logger.warn({ assetsDir }, "Font assets directory does not exist");
    return;
  }

  const required = getRequiredFontFiles();
  let loaded = 0;
  let missing = 0;

  for (const fileName of required) {
    const filePath = `${assetsDir}/${fileName}`;
    if (!fs.existsSync(filePath)) {
      logger.warn({ fileName }, "Font file not found — text rendering may fall back to default");
      missing++;
      continue;
    }

    // Derive a family name from the file name: NotoSansDevanagari-Regular.ttf -> Noto Sans Devanagari
    const familyName = deriveFamilyName(fileName);
    if (!registeredFamilies.has(`${familyName}:${fileName}`)) {
      GlobalFonts.registerFromPath(filePath, familyName);
      registeredFamilies.add(`${familyName}:${fileName}`);
      loaded++;
    }
  }

  fontsLoaded = true;
  logger.info({ loaded, missing, total: required.length }, "Fonts registered with canvas");
}

/**
 * Ensure the font for a specific language is registered.
 * Call this before rendering text in that language.
 */
export function ensureFontLoaded(language: Language): boolean {
  const entry = getFontEntry(language);
  const key = `${entry.fontFamily}:${entry.fileName}`;

  if (registeredFamilies.has(key)) return true;

  if (!fs.existsSync(entry.filePath)) {
    logger.warn({ language, filePath: entry.filePath }, "Font file missing for language");
    return false;
  }

  GlobalFonts.registerFromPath(entry.filePath, entry.fontFamily);
  registeredFamilies.add(key);
  return true;
}

/**
 * Get the canvas-compatible font string for a language.
 * Example: "32px Noto Sans Devanagari"
 */
export function getCanvasFont(language: Language, sizePx: number, bold = false): string {
  const entry = getFontEntry(language);
  const weight = bold ? "bold " : "";
  return `${weight}${sizePx}px "${entry.fontFamily}"`;
}

/** Check which fonts are currently registered */
export function getLoadedFontFamilies(): string[] {
  return [...registeredFamilies];
}

// ─── Internals ─────────────────────────────────────────────

function deriveFamilyName(fileName: string): string {
  // "NotoSansDevanagari-Regular.ttf" -> "Noto Sans Devanagari"
  // "NotoSans-Bold.ttf" -> "Noto Sans"
  const base = fileName.replace(/-(Regular|Bold)\.ttf$/, "");
  // Insert spaces before capital letters: "NotoSansDevanagari" -> "Noto Sans Devanagari"
  return base.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export { fontsLoaded };
