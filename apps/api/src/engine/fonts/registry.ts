import path from "path";
import type { Language } from "@ep/shared";

/**
 * Font registry mapping each supported language to its Noto Sans font file.
 *
 * Font files must be placed in the `assets/` directory alongside this module.
 * All fonts are Google Noto Sans variants, OFL-licensed.
 *
 * Download from: https://fonts.google.com/noto
 */

const ASSETS_DIR = path.join(__dirname, "assets");

interface FontEntry {
  language: Language;
  fontFamily: string;
  fileName: string;
  filePath: string;
  /** Fallback font file names in priority order */
  fallbacks: string[];
}

/**
 * Maps each language to its primary font file and fallback chain.
 * Latin-script languages (English, Spanish, French, Portuguese, German) share Noto Sans.
 * Hindi uses Noto Sans Devanagari.
 * Arabic, Japanese, Chinese, Korean each have dedicated script fonts.
 */
const FONT_MAP: Record<Language, FontEntry> = {
  ENGLISH: {
    language: "ENGLISH",
    fontFamily: "Noto Sans",
    fileName: "NotoSans-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSans-Regular.ttf"),
    fallbacks: [],
  },
  HINDI: {
    language: "HINDI",
    fontFamily: "Noto Sans Devanagari",
    fileName: "NotoSansDevanagari-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSansDevanagari-Regular.ttf"),
    fallbacks: ["NotoSans-Regular.ttf"],
  },
  SPANISH: {
    language: "SPANISH",
    fontFamily: "Noto Sans",
    fileName: "NotoSans-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSans-Regular.ttf"),
    fallbacks: [],
  },
  FRENCH: {
    language: "FRENCH",
    fontFamily: "Noto Sans",
    fileName: "NotoSans-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSans-Regular.ttf"),
    fallbacks: [],
  },
  ARABIC: {
    language: "ARABIC",
    fontFamily: "Noto Sans Arabic",
    fileName: "NotoSansArabic-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSansArabic-Regular.ttf"),
    fallbacks: ["NotoSans-Regular.ttf"],
  },
  JAPANESE: {
    language: "JAPANESE",
    fontFamily: "Noto Sans JP",
    fileName: "NotoSansJP-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSansJP-Regular.ttf"),
    fallbacks: ["NotoSans-Regular.ttf"],
  },
  CHINESE: {
    language: "CHINESE",
    fontFamily: "Noto Sans SC",
    fileName: "NotoSansSC-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSansSC-Regular.ttf"),
    fallbacks: ["NotoSans-Regular.ttf"],
  },
  KOREAN: {
    language: "KOREAN",
    fontFamily: "Noto Sans KR",
    fileName: "NotoSansKR-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSansKR-Regular.ttf"),
    fallbacks: ["NotoSans-Regular.ttf"],
  },
  PORTUGUESE: {
    language: "PORTUGUESE",
    fontFamily: "Noto Sans",
    fileName: "NotoSans-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSans-Regular.ttf"),
    fallbacks: [],
  },
  GERMAN: {
    language: "GERMAN",
    fontFamily: "Noto Sans",
    fileName: "NotoSans-Regular.ttf",
    filePath: path.join(ASSETS_DIR, "NotoSans-Regular.ttf"),
    fallbacks: [],
  },
};

/**
 * Bold variants mapping.
 * For Latin/Devanagari we have separate Bold files or variable fonts.
 * For CJK/Arabic, the regular variable fonts contain all weights.
 */
const BOLD_SUFFIX_MAP: Record<string, string> = {
  "NotoSans-Regular.ttf": "NotoSans-Bold.ttf",
  "NotoSansDevanagari-Regular.ttf": "NotoSansDevanagari-Regular.ttf",
  "NotoSansArabic-Regular.ttf": "NotoSansArabic-Regular.ttf",
  "NotoSansJP-Regular.ttf": "NotoSansJP-Regular.ttf",
  "NotoSansSC-Regular.ttf": "NotoSansSC-Regular.ttf",
  "NotoSansKR-Regular.ttf": "NotoSansKR-Regular.ttf",
};

export function getFontEntry(language: Language): FontEntry {
  return FONT_MAP[language] ?? FONT_MAP.ENGLISH;
}

export function getFontPath(language: Language): string {
  return getFontEntry(language).filePath;
}

export function getFontFamily(language: Language): string {
  return getFontEntry(language).fontFamily;
}

export function getBoldFontPath(language: Language): string | null {
  const entry = getFontEntry(language);
  const boldFile = BOLD_SUFFIX_MAP[entry.fileName];
  return boldFile ? path.join(ASSETS_DIR, boldFile) : null;
}

export function getAssetsDir(): string {
  return ASSETS_DIR;
}

/** Unique font file names needed (deduplicated across languages) */
export function getRequiredFontFiles(): string[] {
  const files = new Set<string>();
  for (const entry of Object.values(FONT_MAP)) {
    files.add(entry.fileName);
  }
  // Also add bold variants
  for (const boldFile of Object.values(BOLD_SUFFIX_MAP)) {
    files.add(boldFile);
  }
  return [...files];
}

export { FONT_MAP, ASSETS_DIR, type FontEntry };
