import type { Language, Position } from "@ep/shared";
import type { OverlayField } from "./renderers/overlay.js";

/**
 * Dynamic Prompt Builder
 *
 * Generates provider-specific AI prompts for poster/creative generation.
 *
 * Three prompt variants:
 *
 * 1. `buildGenerationPrompt()`  — Structured prompt for OpenAI.
 *    OpenAI handles structured input well. Uses section headers and
 *    clear field-by-field instructions. ~500-800 tokens target.
 *
 * 2. `buildGeminiPrompt()`      — Split prompt for Google Gemini.
 *    Returns { systemInstruction, userContent } so rules go into
 *    Gemini's dedicated systemInstruction field (higher priority)
 *    and content goes into the user message. ~400-600 tokens total.
 *
 * 3. `buildIdeogramPrompt()`    — Concise natural-language prompt for Ideogram.
 *    Ideogram renders structured formatting as visual content, so this
 *    uses flowing sentences without headers, bullets, or rule blocks.
 *
 * Architecture:
 * - Fields are split into "positioned" (have explicit grid position) and
 *   "unpositioned" (included as content, AI decides placement).
 * - Each field gets ONE inline language directive (translate / keep exact).
 *   No separate translation tables or DO NOT TRANSLATE lists.
 * - Template theme/event context is preserved via explicit instruction.
 * - Text quality rules prevent garbling, merging, and overlapping.
 */

/** Map position codes to spatial descriptions */
const POSITION_DESCRIPTIONS: Record<Position, string> = {
  TOP_LEFT: "top-left corner",
  TOP_CENTER: "top-center",
  TOP_RIGHT: "top-right corner",
  MIDDLE_LEFT: "middle-left side",
  MIDDLE_CENTER: "center",
  MIDDLE_RIGHT: "middle-right side",
  BOTTOM_LEFT: "bottom-left corner",
  BOTTOM_CENTER: "bottom-center",
  BOTTOM_RIGHT: "bottom-right corner",
};

/** Map language codes to display names and scripts */
const LANGUAGE_INFO: Record<string, { name: string; script: string; direction: string }> = {
  ENGLISH: { name: "English", script: "Latin", direction: "LTR" },
  HINDI: { name: "Hindi", script: "Devanagari", direction: "LTR" },
  SPANISH: { name: "Spanish", script: "Latin", direction: "LTR" },
  FRENCH: { name: "French", script: "Latin", direction: "LTR" },
  ARABIC: { name: "Arabic", script: "Arabic", direction: "RTL" },
  JAPANESE: { name: "Japanese", script: "Japanese (Kanji/Hiragana/Katakana)", direction: "LTR" },
  CHINESE: { name: "Chinese", script: "Simplified Chinese (Hanzi)", direction: "LTR" },
  KOREAN: { name: "Korean", script: "Korean (Hangul)", direction: "LTR" },
  PORTUGUESE: { name: "Portuguese", script: "Latin", direction: "LTR" },
  GERMAN: { name: "German", script: "Latin", direction: "LTR" },
  GUJARATI: { name: "Gujarati", script: "Gujarati", direction: "LTR" },
  MARATHI: { name: "Marathi", script: "Devanagari", direction: "LTR" },
  TAMIL: { name: "Tamil", script: "Tamil", direction: "LTR" },
  TELUGU: { name: "Telugu", script: "Telugu", direction: "LTR" },
  BENGALI: { name: "Bengali", script: "Bengali", direction: "LTR" },
  KANNADA: { name: "Kannada", script: "Kannada", direction: "LTR" },
  MALAYALAM: { name: "Malayalam", script: "Malayalam", direction: "LTR" },
  PUNJABI: { name: "Punjabi", script: "Gurmukhi", direction: "LTR" },
  URDU: { name: "Urdu", script: "Nastaliq/Arabic", direction: "RTL" },
};

export interface PromptBuilderInput {
  /** User's creative direction / additional prompt */
  userPrompt: string;
  /** Dynamic field values with their types and positions */
  fields: OverlayField[];
  /** Target language for this generation */
  language: Language;
  /** Template description from admin (optional) */
  templateDescription?: string;
  /** Whether a logo image is provided */
  hasLogo: boolean;
  /**
   * Number of individual source images from multi-image custom uploads.
   * When > 1, prompts describe multiple reference images so the model
   * understands each image separately (e.g., product from different angles).
   */
  sourceImageCount?: number;
}

/** Return type for Gemini's split prompt (system instruction + user content) */
export interface GeminiPromptParts {
  systemInstruction: string;
  userContent: string;
}


// ═══════════════════════════════════════════════════════════════════
//  Shared: Build per-field instruction line
// ═══════════════════════════════════════════════════════════════════

/**
 * Build ONE instruction line for a single field.
 * Includes the exact value, positioning (if any), and inline language directive.
 * No separate translation tables — everything the AI needs is in this one line.
 */
function buildFieldInstruction(
  field: OverlayField,
  language: Language,
  langInfo: { name: string; script: string },
): string {
  const key = field.fieldKey.replace(/_/g, " ");
  const isPhone = isPhoneField(field);
  const translatable = isTranslatable(field);

  // Position prefix
  const posPrefix = field.position
    ? `[${(POSITION_DESCRIPTIONS[field.position] ?? "prominently").toUpperCase()}] `
    : "";

  // Build the value + language directive as ONE instruction
  if (isPhone) {
    const digits = String(field.value).replace(/\D/g, "");
    return (
      `${posPrefix}${key}: Phone number "${field.value}" — ` +
      `render all ${digits.length} digits clearly and legibly (${digits.split("").join(" ")}). ` +
      `Do not translate or modify.`
    );
  }

  if (language !== "ENGLISH" && translatable) {
    return (
      `${posPrefix}${key}: Translate "${field.value}" into ${langInfo.name} using ${langInfo.script} script. ` +
      `The translated text must be legible and correctly rendered.`
    );
  }

  // Non-translatable (brand names, emails, URLs, addresses, social) or English language
  const typeHint = getFieldTypeHint(field.fieldType, field.fieldKey);
  return `${posPrefix}${key}: "${field.value}" — display EXACTLY as written, do not translate or modify. ${typeHint}`;
}


// ═══════════════════════════════════════════════════════════════════
//  OpenAI Prompt — Structured format, ~500-800 tokens
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a structured AI prompt for OpenAI poster/creative generation.
 *
 * Structured with clear section headers — OpenAI handles this format well.
 * Each field gets ONE inline instruction with language directive.
 * No separate translation tables or DO NOT TRANSLATE lists.
 */
export function buildGenerationPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, hasLogo, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");

  // Split into positioned and unpositioned
  const positionedFields = textFields.filter((f) => f.position);
  const unpositionedFields = textFields.filter((f) => !f.position);

  const { mainTitles, contactInfo } = classifyFields(textFields);

  const sections: string[] = [];

  // ─── Section 1: Role + Core Rules ──────────────────────
  sections.push(
    `You are a professional graphic designer creating a high-quality poster/creative.\n\n` +
    `CORE RULES:\n` +
    `1. Include ALL ${textFields.length} text element${textFields.length === 1 ? "" : "s"} listed below — every single one must appear in the output.\n` +
    `2. Do not add any text, numbers, labels, slogans, or symbols beyond what is specified.\n` +
    `3. Render every text element clearly and legibly — no garbled, distorted, overlapping, or merged text.\n` +
    `4. Each text element must be fully readable and distinct from other elements.\n` +
    `5. Preserve the theme and event context visible in the reference image (e.g., event greetings, decorative elements).` +
    (sourceImageCount > 1
      ? `\n\nYou are provided ${sourceImageCount} separate reference images of the same subject from different angles. ` +
        `Study ALL of them to understand the subject's complete appearance.`
      : `\n\nUse the provided reference image as a visual style guide — match its color palette, lighting, mood, and composition.`) +
    `\n\nIntegrate user-provided text naturally into the poster's typography and design — ` +
    `as part of the visual layout, not as flat overlay text.`
  );

  // ─── Template description ────────────────────────────────
  if (templateDescription) {
    sections.push(
      `---\n\nSTYLE REFERENCE\n\n${templateDescription}\n\n` +
      `This describes the visual style only. All text in the output must come from the sections below.`
    );
  }

  // ─── Section 2: Positioned Text Fields ───────────────────
  if (positionedFields.length > 0) {
    const textLines: string[] = [
      `---\n\nPOSITIONED TEXT — ${positionedFields.length} element${positionedFields.length === 1 ? "" : "s"} (place at specified positions)\n`
    ];

    for (const field of positionedFields) {
      textLines.push(`- ${buildFieldInstruction(field, language, langInfo)}`);
    }

    textLines.push(
      `\nPOSITION GRID: The image is divided into a 3×3 grid (top/middle/bottom × left/center/right). ` +
      `Place each element in its specified grid cell.`
    );

    sections.push(textLines.join("\n"));
  }

  // ─── Section 3: Unpositioned Text Fields ─────────────────
  if (unpositionedFields.length > 0) {
    const infoLines: string[] = [
      `---\n\nADDITIONAL CONTENT — ${unpositionedFields.length} element${unpositionedFields.length === 1 ? "" : "s"} (place in a suitable area)\n`
    ];

    infoLines.push(
      `Include ALL of the following as a compact, readable info section in the poster.`
    );
    infoLines.push(
      `Place this section in an area that does not overlap with the positioned elements or main artwork.\n`
    );

    for (const field of unpositionedFields) {
      infoLines.push(`- ${buildFieldInstruction(field, language, langInfo)}`);
    }

    sections.push(infoLines.join("\n"));
  }

  // ─── Section 4: Logo Instructions ──────────────────────────
  if (hasLogo || logoFields.length > 0) {
    const logoInstructions: string[] = [
      `---\n\nLOGO (from second reference image)\n\n` +
      `A logo image has been provided as the SECOND reference image.\n` +
      `Include this logo EXACTLY ONCE in the poster.`
    ];

    for (const field of logoFields) {
      const posDesc = field.position
        ? POSITION_DESCRIPTIONS[field.position] ?? "prominently"
        : "prominently";
      logoInstructions.push(`Place the logo in the ${posDesc} of the poster.`);
    }

    logoInstructions.push(
      `\nLOGO RULES:\n` +
      `• Reproduce the logo exactly as shown — same shape, colors, proportions.\n` +
      `• Place it once only. Do not duplicate or distort it.\n` +
      `• Size it appropriately (visible but not dominating).\n` +
      `• If the logo contains text, reproduce that text exactly as-is.`
    );

    sections.push(logoInstructions.join("\n"));
  } else {
    sections.push(
      `---\n\nLOGO\n\nNo logo provided. Do not add any logo, watermark, or brand mark.`
    );
  }

  // ─── Section 5: Language & Style ──────────────────────────
  const styleRules: string[] = [
    `---\n\nLANGUAGE & QUALITY\n`
  ];

  if (language === "ENGLISH") {
    styleRules.push(`Language: English.`);
  } else {
    styleRules.push(
      `Output language: ${langInfo.name.toUpperCase()} (${langInfo.script} script).\n\n` +
      `IMPORTANT: Each field above has its own language instruction (translate or keep exact). Follow those per-field instructions precisely.\n` +
      `• Fields marked "translate" → render in ${langInfo.name} using ${langInfo.script} script.\n` +
      `• Fields marked "display EXACTLY as written" → keep in their original language/form. Do NOT transliterate brand names, emails, phone numbers, URLs, or addresses into ${langInfo.script}.`
    );

    if ((language as string) === "ARABIC" || (language as string) === "URDU") {
      styleRules.push(`\nRender ${langInfo.name} text right-to-left (RTL) with correct letter joining.`);
    }
    if ((language as string) === "HINDI" || (language as string) === "MARATHI") {
      styleRules.push(`\nUse proper Devanagari script (हिन्दी). Do not write Hindi words using English/Latin letters. Do not transliterate English brand names into Devanagari — keep them in English.`);
    }
    if ((language as string) === "GUJARATI") {
      styleRules.push(`\nUse proper Gujarati script (ગુજરાતી). Do not transliterate English brand names into Gujarati — keep them in English.`);
    }
    if (["JAPANESE", "CHINESE", "KOREAN"].includes(language)) {
      styleRules.push(`\nUse proper ${langInfo.script} characters. Do not substitute with Latin/English characters.`);
    }
  }

  // Visual hierarchy
  if (mainTitles.length > 0 || contactInfo.length > 0) {
    styleRules.push(
      `\nVISUAL HIERARCHY:\n` +
      `• Main titles/names → LARGEST text size\n` +
      `• Other info → MEDIUM text size\n` +
      `• Contact details (phone, email, address, website, social) → SMALLEST text size`
    );
  }

  styleRules.push(
    `\nTEXT QUALITY:\n` +
    `• Every text element must be crisp, clear, and fully readable.\n` +
    `• Do not let text elements overlap, merge into each other, or bleed into artwork.\n` +
    `• Maintain proper spacing between all text elements.\n` +
    `• Match professional poster typography standards.`
  );

  styleRules.push(
    `\nDESIGN: Match the visual style of the reference image. ` +
    `The poster should look professionally designed with the provided content.`
  );

  if (userPrompt.trim()) {
    styleRules.push(`\nCreative direction: ${userPrompt}`);
  }

  sections.push(styleRules.join("\n"));

  return sections.join("\n\n");
}


// ═══════════════════════════════════════════════════════════════════
//  Gemini Prompt — Split into systemInstruction + userContent
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a split prompt for Google Gemini image generation.
 *
 * Returns separate system instruction and user content.
 * Each field gets ONE inline language directive — no separate translation tables.
 */
export function buildGeminiPrompt(input: PromptBuilderInput): GeminiPromptParts {
  const { userPrompt, fields, language, templateDescription, hasLogo, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const positionedFields = textFields.filter((f) => f.position);
  const unpositionedFields = textFields.filter((f) => !f.position);

  // ─── System Instruction (rules & role) ──────────────────
  const systemParts: string[] = [
    `You are a professional graphic designer. Generate a high-quality poster image.`,
    ``,
    `Rules:`,
    `1. Include ALL text elements the user specifies — every single one must appear in the output.`,
    `2. Do not add any text, numbers, labels, slogans, or symbols beyond what is specified.`,
    `3. Use the reference image as a visual style guide — match its colors, lighting, mood, and composition.`,
    `4. Preserve the theme and event context from the reference image (e.g., event greetings, decorative elements).`,
    `5. Integrate text naturally into the poster's typography — as part of the visual design, not flat overlay text.`,
    `6. Render ALL text clearly and legibly — no garbled, distorted, overlapping, or merged text.`,
    `7. Each text element must be fully readable and visually distinct from other elements.`,
    `8. Place positioned elements in their specified grid cells (3×3 grid: top/middle/bottom × left/center/right).`,
    `9. Render all phone number digits accurately and legibly.`,
    `10. If a value is empty or not provided, omit it entirely. Do not invent content.`,
  ];

  if (language !== "ENGLISH") {
    systemParts.push(
      `11. Follow each field's inline language instruction precisely: "translate" means render in ${langInfo.name} using ${langInfo.script}; "display EXACTLY as written" means keep as-is. Do NOT transliterate brand names, emails, or contact info into ${langInfo.script}.`
    );
    if ((language as string) === "ARABIC" || (language as string) === "URDU") {
      systemParts.push(`12. Render ${langInfo.name} text right-to-left (RTL) with correct letter joining.`);
    }
    if ((language as string) === "HINDI" || (language as string) === "MARATHI") {
      systemParts.push(`12. Use Devanagari script (हिन्दी) for translated text. Keep English brand names in English — do not transliterate them.`);
    }
    if ((language as string) === "GUJARATI") {
      systemParts.push(`12. Use Gujarati script (ગુજરાતી) for translated text. Keep English brand names in English.`);
    }
  }

  const systemInstruction = systemParts.join("\n");

  // ─── User Content (what to generate) ────────────────────
  const userParts: string[] = [];

  // Multi-image context
  if (sourceImageCount > 1) {
    userParts.push(
      `I've provided ${sourceImageCount} reference images of the same subject from different angles. ` +
      `Study all of them to understand the subject's complete appearance and create an accurate depiction.`
    );
  }

  // Style reference
  if (templateDescription) {
    userParts.push(`Reference style: ${templateDescription}`);
  }

  // Positioned text fields
  if (positionedFields.length > 0) {
    userParts.push(`\nCreate a poster with these ${positionedFields.length} positioned text element${positionedFields.length === 1 ? "" : "s"}:`);
    for (const field of positionedFields) {
      userParts.push(`• ${buildFieldInstruction(field, language, langInfo)}`);
    }
  }

  // Unpositioned text fields
  if (unpositionedFields.length > 0) {
    userParts.push(`\nAlso include these ${unpositionedFields.length} additional element${unpositionedFields.length === 1 ? "" : "s"} as a compact info section in a suitable area:`);
    for (const field of unpositionedFields) {
      userParts.push(`• ${buildFieldInstruction(field, language, langInfo)}`);
    }
  }

  // Logo
  if (hasLogo || logoFields.length > 0) {
    const logoPos = logoFields[0]?.position
      ? (POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently")
      : "prominently";
    userParts.push(`\nInclude the provided logo at ${logoPos}, reproduced exactly as shown.`);
  } else {
    userParts.push(`\nDo not add any logo or watermark.`);
  }

  // Creative direction
  if (userPrompt.trim()) {
    userParts.push(`\nCreative direction: ${userPrompt}`);
  }

  return {
    systemInstruction,
    userContent: userParts.join("\n"),
  };
}


// ═══════════════════════════════════════════════════════════════════
//  Ideogram Prompt — Concise natural language
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a concise, natural-language prompt for Ideogram.
 *
 * Ideogram CANNOT handle structured prompts with section headers, bullet lists,
 * or all-caps rule blocks — it treats those as content to render visually.
 * Each field still gets its inline language directive.
 */
export function buildIdeogramPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, hasLogo, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");

  const parts: string[] = [];

  // User creative direction comes FIRST — highest priority for Ideogram
  if (userPrompt.trim()) {
    parts.push(userPrompt.trim());
  }

  // Multiple reference images context
  if (sourceImageCount > 1) {
    parts.push(
      `You are provided ${sourceImageCount} separate reference images showing the same subject from different angles. ` +
      `Study all of them to understand the subject's complete appearance and create an accurate depiction.`
    );
  }

  // Template + theme preservation
  if (templateDescription) {
    parts.push(`Reference style: ${templateDescription}. Preserve the theme and event context from the reference.`);
  } else {
    parts.push(`Preserve the theme and event context visible in the reference image.`);
  }

  // Language instruction
  if (language !== "ENGLISH") {
    parts.push(
      `Translatable text must be in ${langInfo.name} using ${langInfo.script} script. ` +
      `Brand names, phone numbers, emails, URLs, and addresses must stay exactly as written — do not transliterate them.`
    );
  }

  // Text fields — natural sentences, with inline language directives
  if (textFields.length > 0) {
    parts.push(`The poster must include exactly the following ${textFields.length} text element${textFields.length === 1 ? "" : "s"} — no extra text:`);

    for (const field of textFields) {
      const isPhone = isPhoneField(field);
      const translatable = isTranslatable(field);
      const posDesc = field.position
        ? `at the ${POSITION_DESCRIPTIONS[field.position] ?? "prominently"}`
        : "in a suitable area";

      if (isPhone) {
        const digits = String(field.value).replace(/\D/g, "");
        parts.push(
          `Show the phone number "${field.value}" ${posDesc}, with every digit perfectly legible (${digits.split("").join(" ")}, ${digits.length} digits total). Do not modify.`
        );
      } else if (language !== "ENGLISH" && translatable) {
        parts.push(
          `Show "${field.value}" translated into ${langInfo.name} ${posDesc}.`
        );
      } else {
        parts.push(
          `Show "${field.value}" exactly as written ${posDesc}. Do not translate or modify.`
        );
      }
    }
  }

  // Logo
  if (hasLogo || logoFields.length > 0) {
    const logoPos = logoFields[0]?.position
      ? (POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently")
      : "prominently";
    parts.push(`Include the provided logo image at the ${logoPos}, reproduced exactly.`);
  } else {
    parts.push(`Do not add any logo, watermark, or brand mark.`);
  }

  // Quality guard
  parts.push(
    `Every text element must be crisp, clear and fully readable — no garbled, overlapping, or merged text. ` +
    `Include only the text elements listed above.`
  );

  return parts.join(" ");
}


// ═══════════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a field represents a phone number.
 * Uses field type AND key pattern matching — works with any field key name.
 */
function isPhoneField(field: OverlayField): boolean {
  const key = field.fieldKey.toLowerCase();
  return (
    field.fieldType === "PHONE" ||
    key.includes("phone") ||
    key.includes("mobile") ||
    key.includes("contact_number") ||
    key.includes("tel")
  );
}

/**
 * Determine if a field's value should be translated into the target language.
 *
 * NEVER translate: phone, email, URL, brand/business names, addresses, social media handles.
 * These are proper nouns, contact data, or structured identifiers that must stay as-is.
 *
 * TRANSLATE: taglines, event names, descriptions, offers, greetings, headlines.
 *
 * This uses field type and key pattern matching — no hardcoded field names.
 */
function isTranslatable(field: OverlayField): boolean {
  const key = field.fieldKey.toLowerCase();
  const type = field.fieldType;

  // Never translate these field types
  if (type === "PHONE" || type === "EMAIL" || type === "URL" || type === "IMAGE") return false;

  // Never translate contact info (detected by key pattern)
  if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) return false;
  if (key.includes("email")) return false;
  if (key.includes("website") || key.includes("url") || key.includes("link")) return false;
  if (key.includes("address") || key.includes("location") || key.includes("venue")) return false;
  if (key.includes("social") || key.includes("instagram") || key.includes("facebook") || key.includes("twitter") || key.includes("youtube")) return false;

  // Never translate brand/business/company names (proper nouns)
  if (key.includes("brand") || key.includes("business") || key.includes("company")) return false;

  // Translate everything else (titles, event names, taglines, descriptions, offers, greetings, etc.)
  return true;
}

/**
 * Classify text fields into visual hierarchy categories
 * based on field type and key patterns. Works with any field key name.
 */
function classifyFields(fields: OverlayField[]): {
  mainTitles: OverlayField[];
  secondaryInfo: OverlayField[];
  contactInfo: OverlayField[];
} {
  const mainTitles: OverlayField[] = [];
  const secondaryInfo: OverlayField[] = [];
  const contactInfo: OverlayField[] = [];

  for (const field of fields) {
    const key = field.fieldKey.toLowerCase();
    const type = field.fieldType;

    if (type === "PHONE" || type === "EMAIL" || type === "URL" ||
        key.includes("phone") || key.includes("mobile") ||
        key.includes("email") || key.includes("website") ||
        key.includes("address") || key.includes("url") ||
        key.includes("social") || key.includes("instagram") ||
        key.includes("facebook") || key.includes("twitter")) {
      contactInfo.push(field);
    } else if (key.includes("name") || key.includes("title") ||
               key.includes("brand") || key.includes("business") ||
               key.includes("event") || key.includes("heading") ||
               key.includes("company")) {
      mainTitles.push(field);
    } else {
      secondaryInfo.push(field);
    }
  }

  return { mainTitles, secondaryInfo, contactInfo };
}

/**
 * Get a rendering hint for a field type to help the AI style it appropriately.
 * Uses field type and key patterns — works with arbitrary field names.
 */
function getFieldTypeHint(fieldType: OverlayField["fieldType"], fieldKey: string): string {
  const keyLower = fieldKey.toLowerCase();

  if (fieldType === "PHONE" || keyLower.includes("phone") || keyLower.includes("mobile")) {
    return ""; // Phone hints are handled inline
  }
  if (fieldType === "EMAIL" || keyLower.includes("email")) {
    return "Email address — render every character accurately.";
  }
  if (fieldType === "URL" || keyLower.includes("website") || keyLower.includes("url")) {
    return "Website URL — render it clearly and accurately.";
  }
  if (keyLower.includes("brand") || keyLower.includes("business") || keyLower.includes("company")) {
    return "Brand/business name — make it prominent. Exact spelling required.";
  }
  if (keyLower.includes("social") || keyLower.includes("instagram") || keyLower.includes("facebook")) {
    return "Social media handle — render exactly.";
  }
  if (keyLower.includes("tagline") || keyLower.includes("slogan")) {
    return "Tagline — render as subtitle, smaller than the main heading.";
  }
  if (keyLower.includes("date") || keyLower.includes("time")) {
    return "Date/time — render clearly and prominently.";
  }
  if (keyLower.includes("venue") || keyLower.includes("location") || keyLower.includes("address")) {
    return "Address/location — render clearly.";
  }
  if (keyLower.includes("offer") || keyLower.includes("discount")) {
    return "Offer/discount text — render the provided text clearly.";
  }

  return "Render clearly to match the design theme.";
}
