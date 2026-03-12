import { logger } from "../utils/logger.js";

/**
 * Prompt Moderation Filter
 *
 * Validates user prompts against:
 * 1. Profanity / obscenity patterns
 * 2. Religious sensitivity patterns
 * 3. Violence / hate speech patterns
 * 4. Explicit content patterns
 *
 * Uses pattern matching (not AI) for low latency.
 * Patterns are designed for Indian festival context.
 */

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  category?: "profanity" | "religious" | "violence" | "explicit" | "spam";
  matchedPattern?: string;
}

// Profanity patterns — common English and Hindi obscenities
// Using partial patterns to catch variations (e.g., plurals, suffixes)
const PROFANITY_PATTERNS: RegExp[] = [
  // English profanity (partial matches for variations)
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+i+t+c+h/i,
  /\bd+a+m+n/i,
  /\bb+a+s+t+a+r+d/i,
  /\bc+u+n+t/i,
  /\bd+i+c+k/i,
  /\bp+u+s+s+y/i,
  /\bw+h+o+r+e/i,
  /\bs+l+u+t/i,
  /\bn+i+g+g/i,
  /\bf+a+g+o?t/i,
  /\bp+o+r+n/i,
  /\bs+e+x+y\b/i,
  /\bn+u+d+e\b/i,
  /\bn+a+k+e+d\b/i,
  // Hindi profanity (Romanized common terms — word boundary enforced)
  /\bchutiy[ae]?\b/i,
  /\bmadarchod\b/i,
  /\bbhenchod\b/i,
  /\bgaand\b/i,
  /\blaude\b/i,
  /\brandi\b/i,
  /\bharami\b/i,
  /\bkamine\b/i,
  /\bkutt[aiye]\b/i,
  /\bsaala\b/i,
  /\bchod\b/i,
];

// Religious sensitivity patterns — protect against disrespectful content
const RELIGIOUS_PATTERNS: RegExp[] = [
  // Anti-religious hate patterns
  /\bhate\s+(hindu|muslim|christian|sikh|jain|buddhist)/i,
  /\b(hindu|muslim|christian|sikh|jain|buddhist)\s+(bad|evil|wrong|fake|false)/i,
  /\b(kill|destroy|attack|burn)\s+(temple|mosque|church|gurudwara)/i,
  /\banti[\s-]?(hindu|muslim|christian|sikh|jain|buddhist)/i,
  /\b(blasphemy|blasphemous)\b/i,
  // Derogatory religious references
  /\b(jihad|crusade)\s+(against|kill)/i,
  /\breligion\s+(is\s+)?(cancer|disease|virus|poison)/i,
  /\b(god|allah|bhagwan|jesus|guru)\s+(is\s+)?(dead|fake|lie|false)/i,
  // Conversion / supremacy
  /\bconvert\s+(or\s+)?(die|kill)/i,
  /\b(only|one)\s+true\s+(religion|god|faith)/i,
];

// Violence / hate speech patterns
const VIOLENCE_PATTERNS: RegExp[] = [
  /\b(kill|murder|assassinat|slaughter)\s+(people|them|him|her|everyone)/i,
  /\b(bomb|explode|detonate|blow\s+up)\b/i,
  /\b(terrorist|terrorism)\b/i,
  /\b(genocide|ethnic\s+cleansing)\b/i,
  /\b(rape|molest|assault)\b/i,
  /\b(shoot|stab|behead)\s+(them|people|him|her)/i,
  /\bsuicide\s+(bomb|attack|mission)/i,
  /\bblood\s*(bath|shed)\b/i,
];

// Explicit content patterns
const EXPLICIT_PATTERNS: RegExp[] = [
  /\b(erotic|erotica)\b/i,
  /\b(xxx|nsfw)\b/i,
  /\b(hentai|bondage|fetish)\b/i,
  /\bstrip\s*(tease|club|per)\b/i,
  /\bsexual\s+(act|content|intercourse)/i,
  /\borgasm\b/i,
  /\bgenitals?\b/i,
];

// Spam / injection patterns
const SPAM_PATTERNS: RegExp[] = [
  // Prompt injection attempts
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\byou\s+are\s+now\s+/i,
  /\bjailbreak/i,
  /\bDAN\s+mode/i,
  // Excessive repetition (spam)
  /(.)\1{10,}/,
  // Suspicious encoded content
  /\\x[0-9a-f]{2}/i,
  /&#\d+;/,
];

/**
 * Check a prompt against all moderation filters.
 * Returns the first violation found, or allowed=true.
 */
export function moderatePrompt(prompt: string): ModerationResult {
  if (!prompt || typeof prompt !== "string") {
    return { allowed: true };
  }

  const trimmed = prompt.trim();

  // Empty prompts are allowed (validation handles min length)
  if (trimmed.length === 0) {
    return { allowed: true };
  }

  // Check profanity
  for (const pattern of PROFANITY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      logger.info({ matchedPattern: match[0] }, "Prompt blocked: profanity");
      return {
        allowed: false,
        reason: "Your prompt contains inappropriate language. Please rephrase.",
        category: "profanity",
        matchedPattern: match[0],
      };
    }
  }

  // Check religious sensitivity
  for (const pattern of RELIGIOUS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      logger.info({ matchedPattern: match[0] }, "Prompt blocked: religious sensitivity");
      return {
        allowed: false,
        reason: "Your prompt contains religiously sensitive content. Please keep prompts respectful.",
        category: "religious",
        matchedPattern: match[0],
      };
    }
  }

  // Check violence
  for (const pattern of VIOLENCE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      logger.info({ matchedPattern: match[0] }, "Prompt blocked: violence");
      return {
        allowed: false,
        reason: "Your prompt contains violent or harmful content.",
        category: "violence",
        matchedPattern: match[0],
      };
    }
  }

  // Check explicit content
  for (const pattern of EXPLICIT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      logger.info({ matchedPattern: match[0] }, "Prompt blocked: explicit content");
      return {
        allowed: false,
        reason: "Your prompt contains explicit content that is not permitted.",
        category: "explicit",
        matchedPattern: match[0],
      };
    }
  }

  // Check spam / injection
  for (const pattern of SPAM_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      logger.info({ matchedPattern: match[0] }, "Prompt blocked: spam/injection");
      return {
        allowed: false,
        reason: "Your prompt was flagged as potentially malicious. Please use natural language.",
        category: "spam",
        matchedPattern: match[0],
      };
    }
  }

  return { allowed: true };
}

/**
 * Moderate field values (business name, phone, etc.) — lighter check.
 * Only profanity and spam patterns.
 */
export function moderateFieldValue(key: string, value: string): ModerationResult {
  if (!value || typeof value !== "string") {
    return { allowed: true };
  }

  const trimmed = value.trim();

  for (const pattern of PROFANITY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        allowed: false,
        reason: `Field "${key}" contains inappropriate language.`,
        category: "profanity",
        matchedPattern: match[0],
      };
    }
  }

  for (const pattern of SPAM_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        allowed: false,
        reason: `Field "${key}" contains suspicious content.`,
        category: "spam",
        matchedPattern: match[0],
      };
    }
  }

  return { allowed: true };
}
