import type { Language, Position } from "@ep/shared";
import type { OverlayField } from "./renderers/overlay.js";

/**
 * Dynamic Prompt Builder
 *
 * Generates structured AI prompts for poster/event creative generation.
 * The prompt has five sections:
 * 1. Design Instructions — what the AI should create
 * 2. Text Content Block — exact text to display with visual hierarchy
 * 3. Phone/Contact Accuracy — dedicated section for exact digit rendering
 * 4. Logo Instructions — how to handle the logo
 * 5. Style & Language Rules — quality constraints, translation rules
 * 6. Final Checklist — reinforcement
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
}

/**
 * Build a structured AI prompt for poster/creative generation.
 */
export function buildGenerationPrompt(input: PromptBuilderInput): string {
  const { userPrompt, fields, language, templateDescription, hasLogo } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  // Separate text fields from logo fields
  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");

  // Classify text fields by visual hierarchy role
  const { mainTitles, secondaryInfo, contactInfo } = classifyFields(textFields);

  // Determine which fields should be translated vs kept as-is
  const translatableFields = textFields.filter((f) => isTranslatable(f));
  const keepAsIsFields = textFields.filter((f) => !isTranslatable(f));

  // Identify phone number fields specifically
  const phoneFields = textFields.filter((f) => isPhoneField(f));

  const sections: string[] = [];

  // ─── Section 1: Design Instructions ─────────────────────
  const totalTextElements = textFields.length;
  sections.push(
    `ABSOLUTE RULE #1 — ZERO INVENTED CONTENT:\n` +
    `The output image must contain EXACTLY ${totalTextElements} text element${totalTextElements === 1 ? "" : "s"} and ABSOLUTELY NOTHING ELSE.\n` +
    `Do NOT invent, infer, imagine, or add ANY text, number, label, slogan, date, name, price, address, or symbol that is not EXPLICITLY listed in the TEXT CONTENT section below.\n` +
    `If you add even ONE word that is not listed below, the generation has FAILED.\n\n` +
    `You are designing a professional poster/creative.\n\n` +
    `RULES (in priority order):\n` +
    `1. ONLY include the EXACT ${totalTextElements} text element${totalTextElements === 1 ? "" : "s"} listed below — ZERO additional text of any kind.\n` +
    `2. Use the provided reference image ONLY as a style guide — match its artistic theme, lighting, colors, and composition.\n` +
    `3. Place each text element in the EXACT position specified. Positions are non-negotiable.\n` +
    `4. The final image must look like a professionally designed poster with text naturally integrated into the scene (on banners, signs, boards, walls, or decorative elements — NOT flat overlay text).\n` +
    `5. Every single digit of phone numbers must be rendered correctly.\n` +
    `6. If a value is empty or not provided, leave it out. Do NOT fill missing content on your own.\n\n` +
    `FORBIDDEN ELEMENTS — NEVER add any of these regardless of visual context, style, or what the reference image suggests:\n` +
    `× Any text NOT listed word-for-word in the TEXT CONTENT section below\n` +
    `× Marketing banners or labels: "NEW ARRIVAL", "SALE", "OFFER", "DISCOUNT", "BUY NOW", "CALL NOW", "HURRY", "LIMITED TIME", "SPECIAL OFFER", "HOT DEAL", "FLASH SALE", "BEST SELLER", "TRENDING", "FREE", "SAVE", "SHOP NOW", "ORDER NOW"\n` +
    `× Promotional phrases: "Visit Us", "Contact Us", "Follow Us", "Join Now", "Subscribe", "Book Now", "Learn More", "Get Started", "Try Now"\n` +
    `× Invented contact info: phone numbers, emails, websites, addresses, street names, city names, ZIP codes NOT listed below\n` +
    `× Invented business info: store hours, opening times, "Open 24/7", "Mon-Sat", directions, maps\n` +
    `× Prices, percentages, numerical values, dates, or quantities not explicitly provided\n` +
    `× Decorative text ribbons, sale stickers, badge overlays, promotional callouts, or star ratings\n` +
    `× Watermarks, copyright notices, attribution text, or photographer credits\n` +
    `× Placeholder text, dummy content, "Lorem ipsum", or template filler text\n` +
    `× Social media handles, hashtags, QR codes, or platform icons not provided\n` +
    `× ANY text that appears in the reference image — the reference is for STYLE only, not content\n` +
    `The ONLY text allowed in the output is what is listed word-for-word in the TEXT CONTENT section. NOTHING else. Count the text elements: there must be EXACTLY ${totalTextElements}.`
  );

  // Template description (if available)
  if (templateDescription) {
    sections.push(
      `---\n\nTEMPLATE CONTEXT (style reference only — do NOT use this to infer or add text elements)\n\n${templateDescription}\n\n` +
      `Note: This context describes the visual style only. Do NOT add any text, labels, or marketing elements based on this description. ALL text in the output must come from the TEXT CONTENT section above.`
    );
  }

  // ─── Section 2: Text Content Block ──────────────────────
  if (textFields.length > 0) {
    const textContentLines: string[] = [
      `---\n\nTEXT CONTENT — EXACTLY ${textFields.length} ELEMENT${textFields.length === 1 ? "" : "S"} (NO MORE, NO LESS)\n` +
      `The poster must contain EXACTLY ${textFields.length} text element${textFields.length === 1 ? "" : "s"}. ` +
      `Adding ANY additional text beyond these ${textFields.length} element${textFields.length === 1 ? "" : "s"} is strictly forbidden.\n`
    ];

    // Build text instructions with explicit positions
    for (const field of textFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
      const typeHint = getFieldTypeHint(field.fieldType, field.fieldKey);
      const translatable = isTranslatable(field);
      const isPhone = isPhoneField(field);

      let textInstruction: string;
      if (isPhone) {
        // Phone numbers get extra-explicit instructions with digit-by-digit spelling
        const digits = String(field.value).replace(/\D/g, "");
        const digitSpelling = digits.split("").join("-");
        textInstruction = `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: PHONE NUMBER "${field.value}" (digits: ${digitSpelling}, ${digits.length} digits total). Render EVERY digit. Do NOT change, skip, or rearrange any digit.`;
      } else if (language !== "ENGLISH" && translatable) {
        textInstruction = `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: TRANSLATE "${field.value}" into ${langInfo.name} using ${langInfo.script} script. The output text must be in ${langInfo.name}, NOT in English. ${typeHint}`;
      } else {
        textInstruction = `- [${posDesc.toUpperCase()}] ${field.fieldKey.replace(/_/g, " ")}: "${field.value}" — display exactly as written. ${typeHint}`;
      }
      textContentLines.push(textInstruction);
    }

    // Visual hierarchy guidance
    textContentLines.push(
      `\nVISUAL HIERARCHY (sizing):\n` +
      `• LARGEST: Main titles — ${mainTitles.length > 0 ? mainTitles.map(f => `"${f.value}"`).join(", ") : "N/A"}\n` +
      `• MEDIUM: Secondary info — ${secondaryInfo.length > 0 ? secondaryInfo.map(f => `"${f.value}"`).join(", ") : "N/A"}\n` +
      `• SMALLEST: Contact details — ${contactInfo.length > 0 ? contactInfo.map(f => `"${f.value}"`).join(", ") : "N/A"}`
    );

    // Position enforcement
    textContentLines.push(
      `\nPOSITION RULES:\n` +
      `• Each element MUST be placed in its specified position (top-left, top-center, etc.).\n` +
      `• The image is divided into a 3x3 grid: top/middle/bottom × left/center/right.\n` +
      `• "top" means the upper third, "middle" means the center third, "bottom" means the lower third.\n` +
      `• Do NOT move elements to different positions than specified.`
    );

    sections.push(textContentLines.join("\n"));
  }

  // ─── Section 3: Phone/Contact Number Accuracy ──────────
  if (phoneFields.length > 0) {
    const phoneLines: string[] = [
      `---\n\n⚠️ PHONE NUMBER ACCURACY — MANDATORY ⚠️\n`
    ];

    for (const field of phoneFields) {
      const digits = String(field.value).replace(/\D/g, "");
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
      phoneLines.push(
        `Phone number to render: "${field.value}"\n` +
        `Position: ${posDesc}\n` +
        `Digit-by-digit: ${digits.split("").join(" ")}\n` +
        `Total digits: ${digits.length}\n` +
        `You MUST render exactly these ${digits.length} digits in this exact order.\n` +
        `Common mistakes to AVOID:\n` +
        `  ✗ Do NOT swap digits (e.g., writing 98 instead of 89)\n` +
        `  ✗ Do NOT skip digits (e.g., showing ${digits.length - 1} digits instead of ${digits.length})\n` +
        `  ✗ Do NOT add extra digits\n` +
        `  ✗ Do NOT merge or blur the number\n` +
        `  ✓ Render the number clearly and legibly in ${posDesc}`
      );
    }

    sections.push(phoneLines.join("\n"));
  }

  // ─── Section 4: Logo Instructions ───────────────────────
  if (hasLogo || logoFields.length > 0) {
    const logoInstructions: string[] = [
      `---\n\nLOGO (from second reference image)\n\n` +
      `A logo image has been provided as the SECOND reference image.\n` +
      `You MUST include this logo EXACTLY ONCE in the poster.`
    ];

    if (logoFields.length > 0) {
      for (const field of logoFields) {
        const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
        logoInstructions.push(`Place the logo in the ${posDesc} of the poster.`);
      }
    }

    logoInstructions.push(
      `\nLOGO RULES:\n` +
      `• Reproduce the logo EXACTLY as shown in the reference — same shape, same colors, same proportions.\n` +
      `• Place it ONCE only. Do NOT duplicate the logo.\n` +
      `• Do NOT distort, stretch, or modify the logo in any way.\n` +
      `• The logo should be clearly visible but sized appropriately (not dominating the poster).\n` +
      `• If the logo has text in it, reproduce that text exactly.`
    );

    sections.push(logoInstructions.join("\n"));
  } else {
    sections.push(
      `---\n\nLOGO\n\nNo logo provided. Do NOT add any logo, watermark, or brand mark.`
    );
  }

  // ─── Section 5: Style & Language Rules ──────────────────
  const styleRules = [
    `---\n\nSTYLE & LANGUAGE RULES\n`
  ];

  // Language-specific translation instructions
  if (language === "ENGLISH") {
    styleRules.push(`Language: English. All text should be in English.`);
  } else {
    styleRules.push(
      `⚠️ LANGUAGE: ${langInfo.name.toUpperCase()} — THIS IS NOT ENGLISH ⚠️\n\n` +
      `The poster MUST be in ${langInfo.name}. This means:\n` +
      `• All translatable text MUST appear in ${langInfo.name} using ${langInfo.script} script.\n` +
      `• Do NOT write English text for translatable fields. The user expects ${langInfo.name} text.\n` +
      `• Phone numbers, emails, URLs → Keep exactly as provided (numbers are universal).\n` +
      `• Brand names → Keep in original language (proper nouns).`
    );

    if (language === "ARABIC") {
      styleRules.push(`• Arabic text MUST be rendered right-to-left (RTL). Ensure correct letter joining and diacritics.`);
    }
    if (language === "JAPANESE" || language === "CHINESE" || language === "KOREAN") {
      styleRules.push(`• Use proper ${langInfo.script} characters. Do NOT use Latin/English characters for ${langInfo.name} words.`);
    }
    if (language === "HINDI") {
      styleRules.push(`• Use Devanagari script (हिन्दी). Do NOT write Hindi words in English/Latin letters.`);
    }

    // Explicit translation table — most important change
    if (translatableFields.length > 0) {
      styleRules.push(
        `\n📋 TRANSLATION TABLE — translate these fields into ${langInfo.name}:\n`
      );
      for (const f of translatableFields) {
        const posDesc = POSITION_DESCRIPTIONS[f.position] ?? "prominently";
        styleRules.push(
          `  INPUT (English): "${f.value}"\n` +
          `  OUTPUT: Translate to ${langInfo.name} using ${langInfo.script} script\n` +
          `  POSITION: ${posDesc}\n`
        );
      }
    }
    if (keepAsIsFields.length > 0) {
      styleRules.push(
        `\n🔒 DO NOT TRANSLATE — keep these exactly as written:\n` +
        keepAsIsFields.map(f => `  • "${f.value}" → keep as-is (${isPhoneField(f) ? "phone number" : "proper noun/contact"})`).join("\n")
      );
    }
  }

  // Design quality rules
  styleRules.push(
    `\nDESIGN QUALITY:\n` +
    `• Match the visual style of the reference template image.\n` +
    `• The design should look like the poster was originally created with this information.\n` +
    `• Text must be integrated naturally into the scene (on signs, banners, boards — not floating).\n` +
    `• Avoid: flat overlay text, spelling errors, unreadable text, watermarks, random/extra text.`
  );

  // User's creative direction
  if (userPrompt.trim()) {
    styleRules.push(`\nUser's creative direction: ${userPrompt}`);
  } else {
    styleRules.push(`\nNo additional creative direction provided. Stay close to the reference style and include only the supplied content.`);
  }

  sections.push(styleRules.join("\n"));

  // ─── Section 6: Final Checklist (reinforcement) ────────
  if (textFields.length > 0 || logoFields.length > 0) {
    const checklist: string[] = [
      `---\n\nFINAL CHECKLIST — verify ALL items before outputting:\n`
    ];

    for (const field of textFields) {
      const posDesc = POSITION_DESCRIPTIONS[field.position] ?? "prominently";
      const translatable = isTranslatable(field);
      const isPhone = isPhoneField(field);

      if (isPhone) {
        const digits = String(field.value).replace(/\D/g, "");
        checklist.push(`□ Phone "${field.value}" → ${digits.length} digits, ALL correct, at ${posDesc}`);
      } else if (language !== "ENGLISH" && translatable) {
        checklist.push(`□ "${field.value}" → TRANSLATED to ${langInfo.name} (${langInfo.script}), at ${posDesc}`);
      } else {
        checklist.push(`□ "${field.value}" → exact text, at ${posDesc}`);
      }
    }

    if (hasLogo || logoFields.length > 0) {
      const logoPos = logoFields.length > 0
        ? POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently"
        : "prominently";
      checklist.push(`□ Logo from reference image → placed ONCE at ${logoPos}`);
    }

    checklist.push(`□ All ${textFields.length} text elements are visible and readable`);
    if (phoneFields.length > 0) {
      checklist.push(`□ Phone number digit count is correct (${phoneFields.map(f => `"${f.value}" = ${String(f.value).replace(/\D/g, "").length} digits`).join(", ")})`);
    }
    if (language !== "ENGLISH" && translatableFields.length > 0) {
      checklist.push(`□ Translatable text is in ${langInfo.name} (${langInfo.script}), NOT in English`);
    }
    checklist.push(`□ EXACTLY ${textFields.length} text element${textFields.length === 1 ? "" : "s"} visible — count them. If you see more than ${textFields.length}, remove the extras.`);
    checklist.push(`□ No invented addresses, street names, city names, or location text`);
    checklist.push(`□ No invented phone numbers, prices, dates, or contact details`);
    checklist.push(`□ No marketing labels ("NEW ARRIVAL", "SALE", "OFFER", "CALL NOW", "VISIT US", "SHOP NOW", etc.)`);
    checklist.push(`□ No extra/random text added — ZERO text beyond the ${textFields.length} element${textFields.length === 1 ? "" : "s"} listed above`);
    checklist.push(`□ No text copied from the reference image — reference is for STYLE only`);
    checklist.push(`□ No duplicate logos`);

    checklist.push(`\n⛔ ABSOLUTE ZERO — if the output contains even ONE word, number, label, or symbol not explicitly listed in the ${textFields.length} text element${textFields.length === 1 ? "" : "s"} above, the generation has FAILED. Remove ALL extra text before finalizing.`);

    sections.push(checklist.join("\n"));
  }

  return sections.join("\n\n");
}

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
    return ""; // Phone hints are handled in the dedicated phone section
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
    return "Offer/discount text — render the provided text clearly. Do NOT add decorative banners, stickers, ribbons, or callout badges around it.";
  }

  return "Render clearly to match the design theme.";
}

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
  const { userPrompt, fields, language, templateDescription, hasLogo } = input;
  const langInfo = LANGUAGE_INFO[language] ?? LANGUAGE_INFO.ENGLISH;

  const textFields = fields.filter((f) => f.fieldType !== "IMAGE");
  const logoFields = fields.filter((f) => f.fieldType === "IMAGE");

  const parts: string[] = [];

  // User creative direction comes FIRST — it has the highest priority for Ideogram
  // (e.g., "place the ring on a female hand", "keep exact product design")
  if (userPrompt.trim()) {
    parts.push(userPrompt.trim());
  }

  // Opening: style reference from template
  if (templateDescription) {
    parts.push(`Reference style: ${templateDescription}.`);
  }

  // Language instruction (upfront, naturally stated)
  if (language !== "ENGLISH") {
    parts.push(
      `All text in the poster must be in ${langInfo.name} using ${langInfo.script} script.`
    );
  }

  // Text elements — natural sentences, no headers or bullets
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

  // Logo instruction
  if (hasLogo || logoFields.length > 0) {
    const logoPos = logoFields[0]
      ? (POSITION_DESCRIPTIONS[logoFields[0].position] ?? "prominently")
      : "prominently";
    parts.push(`Include the provided logo image at the ${logoPos}, reproduced exactly.`);
  } else {
    parts.push(`Do not add any logo, watermark, or brand mark.`);
  }

  // Strict content guard — brief, no block formatting
  parts.push(
    `Do not add any text, phone numbers, website URLs, prices, marketing slogans, "NEW ARRIVAL", "SALE", or any labels that are not listed above.`
  );

  return parts.join(" ");
}
