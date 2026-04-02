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
 * Design principles:
 * - Tell the model what TO do, not what NOT to do
 * - Keep prompts concise (~500 tokens positive instruction)
 * - No exhaustive lists of banned words (they prime the model to generate them)
 * - One clear content guard sentence instead of paragraph-long checklists
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
//  OpenAI Prompt — Structured format, ~500-800 tokens
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a structured AI prompt for OpenAI poster/creative generation.
 *
 * Structured with clear section headers — OpenAI handles this format well.
 * Focuses on POSITIVE instructions (what to create) with a single
 * concise content guard instead of exhaustive forbidden-word lists.
 */
export function buildGenerationPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, hasLogo, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const { mainTitles, secondaryInfo, contactInfo } = classifyFields(textFields);
  const translatableFields = textFields.filter((f) => isTranslatable(f));
  const keepAsIsFields = textFields.filter((f) => !isTranslatable(f));

  const sections: string[] = [];

  // ─── Section 1: Role + Content Rule ──────────────────────
  sections.push(
    `You are a professional graphic designer creating a high-quality poster/creative.\n\n` +
    `CONTENT RULE: The output must contain ONLY the ${textFields.length} text element${textFields.length === 1 ? "" : "s"} listed below. ` +
    `Do not add any other text, numbers, labels, slogans, or symbols beyond what is explicitly specified. ` +
    `If a field value is empty or not provided, leave it out entirely.\n\n` +
    (sourceImageCount > 1
      ? `You are provided ${sourceImageCount} separate reference images of the same subject from different angles. ` +
        `Study ALL of them to understand the subject's complete appearance — shape, color, texture, details — ` +
        `and create an accurate depiction.\n`
      : `Use the provided reference image as a visual style guide — match its color palette, lighting, mood, and composition.\n`) +
    `\nIntegrate text naturally into the poster's typography and design composition — ` +
    `as part of the poster's visual layout, not as flat overlay text.`
  );

  // ─── Template description ────────────────────────────────
  if (templateDescription) {
    sections.push(
      `---\n\nSTYLE REFERENCE\n\n${templateDescription}\n\n` +
      `This describes the visual style only. All text in the output must come from the TEXT CONTENT section below.`
    );
  }

  // ─── Section 2: Text Content ─────────────────────────────
  if (textFields.length > 0) {
    const textLines: string[] = [
      `---\n\nTEXT CONTENT — ${textFields.length} ELEMENT${textFields.length === 1 ? "" : "S"}\n`
    ];

    for (const field of textFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
      const typeHint = getFieldTypeHint(field.fieldType, field.fieldKey);
      const isPhone = isPhoneField(field);

      if (isPhone) {
        const digits = String(field.value).replace(/\D/g, "");
        textLines.push(
          `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: ` +
          `Phone number "${field.value}" — render all ${digits.length} digits clearly and legibly ` +
          `(${digits.split("").join(" ")}).`
        );
      } else if (language !== "ENGLISH" && isTranslatable(field)) {
        textLines.push(
          `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: ` +
          `Translate "${field.value}" into ${langInfo.name} using ${langInfo.script} script. ${typeHint}`
        );
      } else {
        textLines.push(
          `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: ` +
          `"${field.value}" — display exactly as written. ${typeHint}`
        );
      }
    }

    // Visual hierarchy
    textLines.push(
      `\nVISUAL HIERARCHY:\n` +
      `• LARGEST: ${mainTitles.length > 0 ? mainTitles.map(f => `"${f.value}"`).join(", ") : "N/A"}\n` +
      `• MEDIUM: ${secondaryInfo.length > 0 ? secondaryInfo.map(f => `"${f.value}"`).join(", ") : "N/A"}\n` +
      `• SMALLEST: ${contactInfo.length > 0 ? contactInfo.map(f => `"${f.value}"`).join(", ") : "N/A"}`
    );

    // Position rules (simplified)
    textLines.push(
      `\nPOSITION GRID: The image is divided into a 3×3 grid (top/middle/bottom × left/center/right). ` +
      `Place each element in its specified position. Do not move elements to different positions.`
    );

    sections.push(textLines.join("\n"));
  }

  // ─── Section 3: Logo Instructions ─────────────────────────
  if (hasLogo || logoFields.length > 0) {
    const logoInstructions: string[] = [
      `---\n\nLOGO (from second reference image)\n\n` +
      `A logo image has been provided as the SECOND reference image.\n` +
      `Include this logo EXACTLY ONCE in the poster.`
    ];

    for (const field of logoFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
      logoInstructions.push(`Place the logo in the ${posDesc} of the poster.`);
    }

    logoInstructions.push(
      `\nLOGO RULES:\n` +
      `• Reproduce the logo exactly as shown — same shape, colors, proportions.\n` +
      `• Place it once only. Do not duplicate or distort it.\n` +
      `• Size it appropriately (visible but not dominating).\n` +
      `• If the logo contains text, reproduce that text exactly.`
    );

    sections.push(logoInstructions.join("\n"));
  } else {
    sections.push(
      `---\n\nLOGO\n\nNo logo provided. Do not add any logo, watermark, or brand mark.`
    );
  }

  // ─── Section 4: Style & Language ──────────────────────────
  const styleRules: string[] = [
    `---\n\nSTYLE & LANGUAGE\n`
  ];

  if (language === "ENGLISH") {
    styleRules.push(`Language: English. All text should be in English.`);
  } else {
    styleRules.push(
      `LANGUAGE: ${langInfo.name.toUpperCase()}\n\n` +
      `All translatable text must appear in ${langInfo.name} using ${langInfo.script} script.\n` +
      `Phone numbers, emails, URLs → Keep exactly as provided.\n` +
      `Brand names → Keep in original language.`
    );

    if (language === "ARABIC") {
      styleRules.push(`Arabic text must be rendered right-to-left (RTL) with correct letter joining.`);
    }
    if (language === "JAPANESE" || language === "CHINESE" || language === "KOREAN") {
      styleRules.push(`Use proper ${langInfo.script} characters. Do not substitute with Latin/English characters.`);
    }
    if (language === "HINDI") {
      styleRules.push(`Use Devanagari script (हिन्दी). Do not write Hindi in English/Latin letters.`);
    }

    // Translation table
    if (translatableFields.length > 0) {
      styleRules.push(`\nTRANSLATION TABLE — translate these into ${langInfo.name}:\n`);
      for (const f of translatableFields) {
        const posDesc = POSITION_DESCRIPTIONS[f.position] ?? "prominently";
        styleRules.push(
          `  "${f.value}" → ${langInfo.name} (${langInfo.script}), position: ${posDesc}`
        );
      }
    }
    if (keepAsIsFields.length > 0) {
      styleRules.push(
        `\nDO NOT TRANSLATE — keep exactly as written:\n` +
        keepAsIsFields.map(f => `  • "${f.value}" (${isPhoneField(f) ? "phone number" : "proper noun/contact"})`).join("\n")
      );
    }
  }

  // Design quality
  styleRules.push(
    `\nDESIGN: Match the visual style of the reference image. ` +
    `The poster should look professionally designed with the provided content.`
  );

  // User's creative direction
  if (userPrompt.trim()) {
    styleRules.push(`\nCreative direction: ${userPrompt}`);
  }

  sections.push(styleRules.join("\n"));

  // NO FINAL CHECKLIST — the content rule in Section 1 is sufficient.

  return sections.join("\n\n");
}


// ═══════════════════════════════════════════════════════════════════
//  Gemini Prompt — Split into systemInstruction + userContent
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a split prompt for Google Gemini image generation.
 *
 * Returns separate system instruction and user content:
 * - `systemInstruction`: Behavioral rules and role — sent via Gemini's
 *   dedicated systemInstruction field for higher-priority processing.
 * - `userContent`: The actual content to generate (text fields, positions,
 *   style reference, creative direction).
 *
 * This leverages Gemini's architecture where system instructions are
 * processed with higher attention weight than user messages.
 */
export function buildGeminiPrompt(input: PromptBuilderInput): GeminiPromptParts {
  const { userPrompt, fields, language, templateDescription, hasLogo, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const translatableFields = textFields.filter((f) => isTranslatable(f));
  const keepAsIsFields = textFields.filter((f) => !isTranslatable(f));

  // ─── System Instruction (rules & role) ──────────────────
  const systemParts: string[] = [
    `You are a professional graphic designer. Generate a high-quality poster image.`,
    ``,
    `Rules:`,
    `1. Include ONLY the text elements the user specifies. Do not add any additional text, numbers, labels, slogans, or symbols.`,
    `2. Use the reference image as a visual style guide — match its colors, lighting, mood, and composition.`,
    `3. Integrate text naturally into the poster's typography — as part of the visual design, not flat overlay text.`,
    `4. Place each text element in its specified position using a 3×3 grid (top/middle/bottom × left/center/right).`,
    `5. If a value is empty or not provided, omit it entirely. Do not invent content.`,
    `6. Render all phone number digits accurately and legibly.`,
  ];

  if (language !== "ENGLISH") {
    systemParts.push(
      `7. All translatable text must be in ${langInfo.name} using ${langInfo.script} script. Keep phone numbers, emails, URLs, and brand names as-is.`
    );
    if (language === "ARABIC") {
      systemParts.push(`8. Render Arabic text right-to-left (RTL) with correct letter joining.`);
    }
    if (language === "HINDI") {
      systemParts.push(`8. Use Devanagari script (हिन्दी). Do not use Latin letters for Hindi.`);
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

  // Text fields
  if (textFields.length > 0) {
    userParts.push(`\nCreate a poster with exactly these ${textFields.length} text element${textFields.length === 1 ? "" : "s"}:`);

    for (const field of textFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";

      if (isPhoneField(field)) {
        const digits = String(field.value).replace(/\D/g, "");
        userParts.push(
          `• At ${posDesc}: Phone number "${field.value}" (${digits.length} digits: ${digits.split("").join(" ")})`
        );
      } else if (language !== "ENGLISH" && isTranslatable(field)) {
        userParts.push(
          `• At ${posDesc}: Translate "${field.value}" into ${langInfo.name}`
        );
      } else {
        userParts.push(
          `• At ${posDesc}: "${field.value}" (exact text)`
        );
      }
    }
  }

  // Logo
  if (hasLogo || logoFields.length > 0) {
    const logoPos = logoFields[0]
      ? (POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently")
      : "prominently";
    userParts.push(`\nInclude the provided logo at ${logoPos}, reproduced exactly as shown.`);
  } else {
    userParts.push(`\nDo not add any logo or watermark.`);
  }

  // Translation specifics
  if (language !== "ENGLISH" && translatableFields.length > 0) {
    userParts.push(`\nTranslate these into ${langInfo.name} (${langInfo.script}):`);
    for (const f of translatableFields) {
      userParts.push(`  "${f.value}" → ${langInfo.name}`);
    }
    if (keepAsIsFields.length > 0) {
      userParts.push(`Keep these as-is: ${keepAsIsFields.map(f => `"${f.value}"`).join(", ")}`);
    }
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
 * or all-caps rule blocks — it treats those as content to render visually,
 * producing billboard-like imagery with garbled text from the prompt structure.
 *
 * This produces a short, flowing description that Ideogram interprets correctly.
 * magic_prompt_option must stay OFF so Ideogram doesn't rewrite this.
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
      `You are provided ${sourceImageCount} separate reference images showing the same subject from different angles or perspectives. ` +
      `Study all of them to understand the subject's complete appearance — shape, color, texture, and details from every angle. ` +
      `Use this comprehensive understanding to create an accurate and detailed depiction of the subject.`
    );
  }

  // Style reference from template
  if (templateDescription) {
    parts.push(`Reference style: ${templateDescription}.`);
  }

  // Language instruction
  if (language !== "ENGLISH") {
    parts.push(
      `All text in the poster must be in ${langInfo.name} using ${langInfo.script} script.`
    );
  }

  // Text elements — natural sentences
  if (textFields.length > 0) {
    parts.push(`The poster must show exactly the following text elements and nothing else:`);

    for (const field of textFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";

      if (isPhoneField(field)) {
        const digits = String(field.value).replace(/\D/g, "");
        parts.push(
          `At the ${posDesc}, show the phone number "${field.value}" with every digit perfectly legible (${digits.split("").join(" ")}, ${digits.length} digits total).`
        );
      } else if (language !== "ENGLISH" && isTranslatable(field)) {
        parts.push(
          `At the ${posDesc}, show "${field.value}" translated into ${langInfo.name}.`
        );
      } else {
        parts.push(
          `At the ${posDesc}, show the text "${field.value}" exactly as written.`
        );
      }
    }
  }

  // Logo
  if (hasLogo || logoFields.length > 0) {
    const logoPos = logoFields[0]
      ? (POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently")
      : "prominently";
    parts.push(`Include the provided logo image at the ${logoPos}, reproduced exactly.`);
  } else {
    parts.push(`Do not add any logo, watermark, or brand mark.`);
  }

  // Concise content guard — NO list of banned marketing terms
  parts.push(
    `Include only the text elements listed above. Do not add any other text, labels, or numbers.`
  );

  return parts.join(" ");
}


// ═══════════════════════════════════════════════════════════════════
//  Helper Functions (unchanged)
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a field represents a phone number.
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
 * Brand names, phone numbers, emails, URLs, addresses → keep as-is.
 * Taglines, event names, descriptions, offers → translate.
 */
function isTranslatable(field: OverlayField): boolean {
  const key = field.fieldKey.toLowerCase();
  const type = field.fieldType;

  // Never translate these types
  if (type === "PHONE" || type === "EMAIL" || type === "URL" || type === "IMAGE") return false;

  // Never translate contact info
  if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) return false;
  if (key.includes("email")) return false;
  if (key.includes("website") || key.includes("url")) return false;
  if (key.includes("address")) return false;

  // Don't translate brand/business names (proper nouns)
  if (key.includes("brand") || key.includes("business") || key.includes("company")) return false;
  if (key === "business_name" || key === "brand_name" || key === "company_name") return false;

  // Translate everything else (titles, event names, taglines, descriptions, offers, etc.)
  return true;
}

/**
 * Classify text fields into visual hierarchy categories
 * based on field type and key patterns.
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
        key.includes("address") || key.includes("url")) {
      contactInfo.push(field);
    } else if (key.includes("name") || key.includes("title") ||
               key.includes("brand") || key.includes("business") ||
               key.includes("event") || key.includes("heading")) {
      mainTitles.push(field);
    } else {
      secondaryInfo.push(field);
    }
  }

  return { mainTitles, secondaryInfo, contactInfo };
}

/**
 * Get a rendering hint for a field type to help the AI style it appropriately.
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
  if (keyLower.includes("tagline") || keyLower.includes("slogan")) {
    return "Tagline — render as subtitle, smaller than the main heading.";
  }
  if (keyLower.includes("date") || keyLower.includes("time")) {
    return "Date/time — render clearly and prominently.";
  }
  if (keyLower.includes("venue") || keyLower.includes("location")) {
    return "Venue/location — render clearly.";
  }
  if (keyLower.includes("offer") || keyLower.includes("discount")) {
    return "Offer/discount text — render the provided text clearly.";
  }

  return "Render clearly to match the design theme.";
}
