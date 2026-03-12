export const Language = {
  ENGLISH: "ENGLISH",
  HINDI: "HINDI",
  SPANISH: "SPANISH",
  FRENCH: "FRENCH",
  ARABIC: "ARABIC",
  JAPANESE: "JAPANESE",
  CHINESE: "CHINESE",
  KOREAN: "KOREAN",
  PORTUGUESE: "PORTUGUESE",
  GERMAN: "GERMAN",
} as const;

export type Language = (typeof Language)[keyof typeof Language];

export interface LanguageConfig {
  code: Language;
  label: string;
  nativeLabel: string;
  script: string;
  fontFamily: string;
  direction: "ltr" | "rtl";
}

export const LANGUAGE_CONFIGS: Record<Language, LanguageConfig> = {
  ENGLISH: {
    code: "ENGLISH",
    label: "English",
    nativeLabel: "English",
    script: "Latin",
    fontFamily: "Noto Sans",
    direction: "ltr",
  },
  HINDI: {
    code: "HINDI",
    label: "Hindi",
    nativeLabel: "\u0939\u093F\u0928\u094D\u0926\u0940",
    script: "Devanagari",
    fontFamily: "Noto Sans Devanagari",
    direction: "ltr",
  },
  SPANISH: {
    code: "SPANISH",
    label: "Spanish",
    nativeLabel: "Espa\u00F1ol",
    script: "Latin",
    fontFamily: "Noto Sans",
    direction: "ltr",
  },
  FRENCH: {
    code: "FRENCH",
    label: "French",
    nativeLabel: "Fran\u00E7ais",
    script: "Latin",
    fontFamily: "Noto Sans",
    direction: "ltr",
  },
  ARABIC: {
    code: "ARABIC",
    label: "Arabic",
    nativeLabel: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
    script: "Arabic",
    fontFamily: "Noto Sans Arabic",
    direction: "rtl",
  },
  JAPANESE: {
    code: "JAPANESE",
    label: "Japanese",
    nativeLabel: "\u65E5\u672C\u8A9E",
    script: "CJK",
    fontFamily: "Noto Sans JP",
    direction: "ltr",
  },
  CHINESE: {
    code: "CHINESE",
    label: "Chinese",
    nativeLabel: "\u4E2D\u6587",
    script: "CJK",
    fontFamily: "Noto Sans SC",
    direction: "ltr",
  },
  KOREAN: {
    code: "KOREAN",
    label: "Korean",
    nativeLabel: "\uD55C\uAD6D\uC5B4",
    script: "Hangul",
    fontFamily: "Noto Sans KR",
    direction: "ltr",
  },
  PORTUGUESE: {
    code: "PORTUGUESE",
    label: "Portuguese",
    nativeLabel: "Portugu\u00EAs",
    script: "Latin",
    fontFamily: "Noto Sans",
    direction: "ltr",
  },
  GERMAN: {
    code: "GERMAN",
    label: "German",
    nativeLabel: "Deutsch",
    script: "Latin",
    fontFamily: "Noto Sans",
    direction: "ltr",
  },
};

export const ALL_LANGUAGES = Object.values(Language);
