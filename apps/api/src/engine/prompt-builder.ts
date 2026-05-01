import type { Language, Position } from "@ep/shared";
import type { OverlayField } from "./renderers/overlay.js";

/**
 * Dynamic Prompt Builder
 *
 * Generates provider-specific AI prompts for poster/creative generation.
 *
 * Three prompt variants:
 * 1. `buildGenerationPrompt()`  — Structured prompt for OpenAI
 * 2. `buildGeminiPrompt()`      — Split systemInstruction + userContent for Gemini
 * 3. `buildIdeogramPrompt()`    — Concise natural-language for Ideogram
 *
 * Design philosophy:
 * - Pass field keys and values directly — AI uses the key name to understand context
 *   (e.g., "businessname", "email", "mobile" are self-descriptive)
 * - Single global language directive — no per-field translate/keep instructions
 * - Minimal rules — modern image models handle layout, typography, and translation natively
 * - No hardcoded field name checks — works with any field schema the admin creates
 * - No forced grouping — AI decides optimal placement for unpositioned fields
 *
 * PROMPT PRIORITY ORDER (highest → lowest attention):
 * 1. Language requirement (MUST be respected)
 * 2. User's creative direction / prompt text
 * 3. Field data (names, values, positions)
 * 4. Style reference description
 * 5. General rules
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
  /**
   * Whether at least one image-type field has a usable reference image.
   * Retained for backwards compatibility — internal logic now derives image
   * handling from the IMAGE-typed entries inside `fields`.
   */
  hasLogo?: boolean;
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
//  Shared helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a simple field line: key + value + position (if any).
 * For PHONE-type fields, spell out digits to improve AI accuracy.
 * No translate/keep directives — handled by global language instruction.
 * The AI reads the field key name (e.g., "businessname", "email") to
 * understand what each field is and how to handle it.
 */
function buildFieldLine(field: OverlayField): string {
  const key = field.fieldKey.replace(/_/g, " ");
  const posPrefix = field.position
    ? `[${(POSITION_DESCRIPTIONS[field.position] ?? "prominently").toUpperCase()}] `
    : "";

  // For phone fields, spell out digits (genuinely improves AI digit accuracy)
  if (field.fieldType === "PHONE") {
    const digits = String(field.value).replace(/\D/g, "");
    return `${posPrefix}${key}: "${field.value}" (${digits.length} digits: ${digits.split("").join(" ")})`;
  }

  return `${posPrefix}${key}: "${field.value}"`;
}

/**
 * Build the global language directive.
 * One clear instruction block instead of per-field translate/keep directives.
 * The AI uses the field key names to decide what to translate.
 */
function buildLanguageDirective(language: Language): string {
  if (language === "ENGLISH") {
    return "LANGUAGE: English. All text must be in English.";
  }

  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const lines: string[] = [
    `⚠ MANDATORY LANGUAGE REQUIREMENT: ${langInfo.name} (${langInfo.script} script).`,
    ``,
    `ALL decorative text, greetings, marketing copy, slogans, event names, and descriptive content MUST be written in ${langInfo.name} using ${langInfo.script} script.`,
    `Do NOT translate or transliterate — keep EXACTLY as provided:`,
    `• Brand names, company names, person names (proper nouns)`,
    `• Phone numbers, email addresses, website URLs`,
    `• Physical addresses, social media handles`,
    `The field key name (e.g., "businessname", "email", "mobile") tells you the nature of each field — use this to decide what to translate vs. keep as-is.`,
  ];

  // Script-specific rules
  if (language === "HINDI" || (language as string) === "MARATHI") {
    lines.push(`Use proper Devanagari script (हिन्दी). Do NOT write ${langInfo.name} in Latin/English letters. Keep English brand names in English.`);
  }
  if ((language as string) === "ARABIC" || (language as string) === "URDU") {
    lines.push(`Render ${langInfo.name} text right-to-left (RTL) with correct letter joining.`);
  }
  if ((language as string) === "GUJARATI") {
    lines.push(`Use proper Gujarati script (ગુજરાતી). Keep English brand names in English.`);
  }
  if (["JAPANESE", "CHINESE", "KOREAN"].includes(language)) {
    lines.push(`Use proper ${langInfo.script} characters. Do not substitute with Latin/English.`);
  }

  return lines.join("\n");
}


// ═══════════════════════════════════════════════════════════════════
//  OpenAI Prompt — Structured format, ~500-800 tokens
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a structured AI prompt for OpenAI poster/creative generation.
 *
 * PRIORITY ORDER (top = highest attention for GPT Image models):
 * 1. Language requirement (Section 1 — top of prompt, highest weight)
 * 2. User's creative direction (Section 2 — early placement = higher attention)
 * 3. Core generation rules (Section 3)
 * 4. Text elements / fields (Section 4)
 * 5. Logo instructions (Section 5)
 * 6. Style quality (Section 6)
 */
export function buildGenerationPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, sourceImageCount = 0 } = input;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const positionedFields = textFields.filter((f) => f.position);
  const unpositionedFields = textFields.filter((f) => !f.position);

  const sections: string[] = [];

  // ─── Section 1: Language (HIGHEST PRIORITY — top of prompt) ──────
  sections.push(buildLanguageDirective(language));

  // ─── Section 2: User's Creative Direction (HIGH PRIORITY) ────────
  if (userPrompt.trim()) {
    sections.push(
      `---\nCREATIVE DIRECTION (follow these instructions carefully):\n${userPrompt.trim()}`
    );
  }

  // ─── Section 3: Role + Core Rules ──────────────────────
  sections.push(
    `---\nYou are a professional graphic designer creating a high-quality poster/creative.\n\n` +
    `RULES:\n` +
    `1. Include ALL ${textFields.length} text element${textFields.length === 1 ? "" : "s"} listed below — every single one MUST appear in the final image.\n` +
    `2. Do NOT add any extra text, labels, or symbols beyond what is listed.\n` +
    `3. Every text element must be crisp, clearly readable, and visually distinct — no overlapping, merging, or garbled text.\n` +
    `4. Preserve the theme and event context from the reference image (decorative elements, greetings, seasonal motifs).\n` +
    `5. Integrate text as part of the poster's visual design — not as flat overlay text.` +
    (sourceImageCount > 1
      ? `\n\nYou have ${sourceImageCount} reference images of the same subject from different angles. Study ALL of them.`
      : `\n\nUse the reference image as a style guide — match its colors, lighting, mood, and composition.`)
  );

  // ─── Template description ────────────────────────────────
  if (templateDescription) {
    sections.push(
      `---\nSTYLE REFERENCE: ${templateDescription}\nThis describes the visual style only. All text content comes from below.`
    );
  }

  // ─── Section 4: ALL text fields (single list) ───────────
  const fieldLines: string[] = [
    `---\nTEXT ELEMENTS (${textFields.length} total — include ALL):\n`
  ];

  for (const field of positionedFields) {
    fieldLines.push(`• ${buildFieldLine(field)}`);
  }
  if (positionedFields.length > 0 && unpositionedFields.length > 0) {
    fieldLines.push(``);
  }
  for (const field of unpositionedFields) {
    fieldLines.push(`• ${buildFieldLine(field)}`);
  }

  if (positionedFields.length > 0) {
    fieldLines.push(
      `\nPositioned elements use a 3×3 grid (top/middle/bottom × left/center/right). Place each in its specified cell.`
    );
  }
  if (unpositionedFields.length > 0) {
    fieldLines.push(
      `\nElements without a [POSITION]: place each where it fits naturally in the design. ` +
      `Use the reference image's composition as a guide. Ensure every element is readable, ` +
      `properly spaced, and does not overlap with other elements.`
    );
  }

  sections.push(fieldLines.join("\n"));

  // ─── Section 5: Image-field Instructions ───────────────────
  // Image fields (logos, headshots, photos) are sent as additional reference
  // images to the AI. Each is described here so the model knows the role of
  // every image and where to place it. Order matches the order the provider
  // receives the buffers.
  if (logoFields.length === 0) {
    sections.push(`---\nNo additional reference images. Do not add any logo, watermark, or brand mark.`);
  } else if (logoFields.length === 1) {
    const f = logoFields[0];
    const label = f.fieldKey.replace(/_/g, " ");
    const pos = f.position
      ? (POSITION_DESCRIPTIONS[f.position] ?? "prominently")
      : "prominently";
    sections.push(
      `---\nADDITIONAL REFERENCE IMAGE — "${label}":\n` +
      `Provided as an extra reference image alongside the style reference. ` +
      `Place at ${pos}, preserving its visual identity exactly (same shape, colors, key features, and — for people — facial identity). ` +
      `Include once only. Do not add any other logo, watermark, or brand mark.`
    );
  } else {
    const lines = logoFields.map((f, i) => {
      const label = f.fieldKey.replace(/_/g, " ");
      const pos = f.position
        ? (POSITION_DESCRIPTIONS[f.position] ?? "naturally where it fits")
        : "naturally where it fits";
      return `${i + 1}. "${label}" — place at ${pos}, preserving its visual identity exactly (same shape, colors, key features, and — for people — facial identity).`;
    });
    sections.push(
      `---\nADDITIONAL REFERENCE IMAGES (${logoFields.length}) — provided in this order, each as a separate reference image:\n` +
      lines.join("\n") +
      `\n\nIncorporate each one into the design accurately. Include each only once. Do not add any other logos, watermarks, or brand marks beyond these.`
    );
  }

  // ─── Section 6: Quality ──────────────────────────────────
  sections.push(
    `---\nProfessional poster quality. Maintain proper spacing between all text elements. Clean, legible typography.`
  );

  return sections.join("\n\n");
}


// ═══════════════════════════════════════════════════════════════════
//  Gemini Prompt — Split into systemInstruction + userContent
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a split prompt for Google Gemini image generation.
 *
 * Returns separate system instruction and user content.
 * Language directive and creative direction in system instruction (higher priority).
 * Field list in user content.
 */
export function buildGeminiPrompt(input: PromptBuilderInput): GeminiPromptParts {
  const { userPrompt, fields, language, templateDescription, sourceImageCount = 0 } = input;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");
  const positionedFields = textFields.filter((f) => f.position);
  const unpositionedFields = textFields.filter((f) => !f.position);

  // ─── System Instruction (rules & role — highest priority) ──────
  const systemParts: string[] = [
    `You are a professional graphic designer. Generate a high-quality poster image.`,
  ];

  // Language directive in system instruction (HIGHEST PRIORITY)
  if (language !== "ENGLISH") {
    systemParts.push(``, buildLanguageDirective(language));
  } else {
    systemParts.push(``, `LANGUAGE: English. All text must be in English.`);
  }

  // User's creative direction in system instruction (HIGH PRIORITY)
  if (userPrompt.trim()) {
    systemParts.push(
      ``,
      `CREATIVE DIRECTION (the user specifically requested this — follow carefully):`,
      userPrompt.trim()
    );
  }

  systemParts.push(
    ``,
    `Rules:`,
    `1. Include ALL ${textFields.length} text elements the user specifies — every single one must appear in the output.`,
    `2. Do not add any text, numbers, labels, or symbols beyond what is specified.`,
    `3. Use the reference image as a visual style guide — match its colors, lighting, mood, and composition.`,
    `4. Preserve the theme and event context from the reference image (decorative elements, greetings, seasonal motifs).`,
    `5. Integrate text naturally into the poster's typography — as part of the visual design, not flat overlay text.`,
    `6. Render ALL text clearly and legibly — no garbled, distorted, overlapping, or merged text.`,
    `7. Each text element must be fully readable and visually distinct from other elements.`,
    `8. Place positioned elements in their specified grid cells (3×3 grid: top/middle/bottom × left/center/right).`,
  );

  const systemInstruction = systemParts.join("\n");

  // ─── User Content (what to generate) ────────────────────
  const userParts: string[] = [];

  // Multi-image context
  if (sourceImageCount > 1) {
    userParts.push(
      `I've provided ${sourceImageCount} reference images of the same subject from different angles. Study all of them.`
    );
  }

  // Style reference
  if (templateDescription) {
    userParts.push(`Reference style: ${templateDescription}`);
  }

  // ALL text fields in one section
  userParts.push(`\nCreate a poster with these ${textFields.length} text element${textFields.length === 1 ? "" : "s"} (include ALL):`);

  for (const field of positionedFields) {
    userParts.push(`• ${buildFieldLine(field)}`);
  }
  for (const field of unpositionedFields) {
    userParts.push(`• ${buildFieldLine(field)}`);
  }

  if (unpositionedFields.length > 0) {
    userParts.push(
      `\nElements without a [POSITION]: place each where it fits naturally in the design, ensuring readability and proper spacing.`
    );
  }

  // Image-field references (logos, headshots, photos)
  if (logoFields.length === 0) {
    userParts.push(`\nDo not add any logo or watermark.`);
  } else if (logoFields.length === 1) {
    const f = logoFields[0];
    const label = f.fieldKey.replace(/_/g, " ");
    const pos = f.position
      ? (POSITION_DESCRIPTIONS[f.position] ?? "prominently")
      : "prominently";
    userParts.push(
      `\nAdditional reference image — "${label}": place at ${pos}, preserving its visual identity exactly (shape, colors, key features, and — for people — facial identity). Include once only.`
    );
  } else {
    userParts.push(`\nAdditional reference images (${logoFields.length}) — provided in this order:`);
    for (let i = 0; i < logoFields.length; i++) {
      const f = logoFields[i];
      const label = f.fieldKey.replace(/_/g, " ");
      const pos = f.position
        ? (POSITION_DESCRIPTIONS[f.position] ?? "naturally where it fits")
        : "naturally where it fits";
      userParts.push(
        `${i + 1}. "${label}" — place at ${pos}, preserving its visual identity exactly (shape, colors, key features, and — for people — facial identity).`
      );
    }
    userParts.push(`Include each only once. Do not add any other logo or watermark.`);
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
 * Uses flowing sentences with simple field key+value references.
 *
 * PRIORITY ORDER for Ideogram: user instructions → language → fields → rules
 */
export function buildIdeogramPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, sourceImageCount = 0 } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");

  const parts: string[] = [];

  // User creative direction comes FIRST — highest priority for Ideogram
  if (userPrompt.trim()) {
    parts.push(userPrompt.trim());
  }

  // Language instruction EARLY — second highest priority
  if (language !== "ENGLISH") {
    parts.push(
      `IMPORTANT: All decorative text, greetings, and marketing copy must be written in ${langInfo.name} using ${langInfo.script} script. ` +
      `Brand names, phone numbers, emails, URLs, addresses, and social media handles must stay exactly as written.`
    );
  }

  // Multiple reference images context
  if (sourceImageCount > 1) {
    parts.push(
      `You are provided ${sourceImageCount} separate reference images showing the same subject from different angles. ` +
      `Study all of them to create an accurate depiction.`
    );
  }

  // Template + theme preservation
  if (templateDescription) {
    parts.push(`Reference style: ${templateDescription}. Preserve the theme and event context from the reference.`);
  } else {
    parts.push(`Preserve the theme and event context visible in the reference image.`);
  }

  // Text fields — flowing sentences with key+value
  if (textFields.length > 0) {
    parts.push(`The poster must include exactly these ${textFields.length} text elements, no extra text:`);

    for (const field of textFields) {
      const key = field.fieldKey.replace(/_/g, " ");
      const posDesc = field.position
        ? `at the ${POSITION_DESCRIPTIONS[field.position] ?? "prominently"}`
        : "in a suitable area";

      if (field.fieldType === "PHONE") {
        const digits = String(field.value).replace(/\D/g, "");
        parts.push(
          `Show ${key} "${field.value}" ${posDesc}, all ${digits.length} digits legible (${digits.split("").join(" ")}).`
        );
      } else {
        parts.push(`Show ${key} "${field.value}" ${posDesc}.`);
      }
    }
  }

  // Image-field references (logos, headshots, photos).
  // Ideogram's API only accepts one reference image, so the actual buffers
  // for these fields are not sent to it — but we still describe them in the
  // prompt so the model attempts to include them faithfully.
  if (logoFields.length === 0) {
    parts.push(`Do not add any logo, watermark, or brand mark.`);
  } else if (logoFields.length === 1) {
    const f = logoFields[0];
    const label = f.fieldKey.replace(/_/g, " ");
    const pos = f.position
      ? (POSITION_DESCRIPTIONS[f.position] ?? "prominently")
      : "prominently";
    parts.push(
      `Include the provided ${label} image at the ${pos}, reproduced exactly.`
    );
  } else {
    const lines = logoFields.map((f) => {
      const label = f.fieldKey.replace(/_/g, " ");
      const pos = f.position
        ? (POSITION_DESCRIPTIONS[f.position] ?? "naturally where it fits")
        : "naturally where it fits";
      return `${label} at the ${pos}`;
    });
    parts.push(
      `Include the following reference images, each reproduced exactly: ${lines.join("; ")}.`
    );
  }

  // Quality guard
  parts.push(
    `Every text element must be crisp, clear and fully readable — no garbled, overlapping, or merged text. ` +
    `Place each element with proper spacing.`
  );

  return parts.join(" ");
}
