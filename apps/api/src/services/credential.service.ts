/**
 * Credential Service — DB-backed API key & secret storage
 *
 * Stores sensitive credentials (API keys, secrets) in the SystemConfig table.
 * Every consumer should call getCredentialOrEnv() which checks DB first,
 * then falls back to the env variable — so existing .env setups keep working.
 *
 * GET responses mask values (show only last 4 chars) for security.
 * Only SUPER_ADMIN users can read/write credentials via admin routes.
 */

import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ─── Credential key → env variable mapping ──────────────────

/** All supported credential keys and their env fallbacks */
const CREDENTIAL_ENV_MAP: Record<string, keyof typeof config> = {
  openai_api_key: "OPENAI_API_KEY",
  ideogram_api_key: "IDEOGRAM_API_KEY",
  razorpay_key_id: "RAZORPAY_KEY_ID",
  razorpay_key_secret: "RAZORPAY_KEY_SECRET",
  razorpay_webhook_secret: "RAZORPAY_WEBHOOK_SECRET",
  apple_key_id: "APPLE_KEY_ID",
  apple_issuer_id: "APPLE_ISSUER_ID",
  apple_bundle_id: "APPLE_BUNDLE_ID",
  apple_private_key: "APPLE_PRIVATE_KEY",
  apple_environment: "APPLE_ENVIRONMENT",
};

/** Set of valid credential keys (for allowlist validation) */
export const CREDENTIAL_KEYS = new Set(Object.keys(CREDENTIAL_ENV_MAP));

// ─── Credential labels for UI display ──────────────────────

export const CREDENTIAL_LABELS: Record<string, { label: string; group: string }> = {
  openai_api_key: { label: "OpenAI API Key", group: "ai" },
  ideogram_api_key: { label: "Ideogram API Key", group: "ai" },
  razorpay_key_id: { label: "Razorpay Key ID", group: "razorpay" },
  razorpay_key_secret: { label: "Razorpay Key Secret", group: "razorpay" },
  razorpay_webhook_secret: { label: "Razorpay Webhook Secret", group: "razorpay" },
  apple_key_id: { label: "Apple Key ID", group: "apple" },
  apple_issuer_id: { label: "Apple Issuer ID", group: "apple" },
  apple_bundle_id: { label: "Apple Bundle ID", group: "apple" },
  apple_private_key: { label: "Apple Private Key", group: "apple" },
  apple_environment: { label: "Apple Environment", group: "apple" },
};

// ─── In-memory cache (avoids hitting DB on every API call) ──

const cache = new Map<string, { value: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

function getCached(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key: string, value: string) {
  cache.set(key, { value, fetchedAt: Date.now() });
}

function invalidateCache(key: string) {
  cache.delete(key);
}

// ─── Service ─────────────────────────────────────────────────

class CredentialService {
  /**
   * Get a credential value from DB. Returns null if not set.
   */
  async getCredential(key: string): Promise<string | null> {
    if (!CREDENTIAL_KEYS.has(key)) return null;

    // Check cache
    const cached = getCached(key);
    if (cached !== undefined) return cached;

    try {
      const row = await prisma.systemConfig.findUnique({
        where: { key: `cred:${key}` },
      });

      if (!row) return null;

      // Value is stored as JSON string
      const value = typeof row.value === "string" ? row.value : JSON.parse(JSON.stringify(row.value));
      const parsed = typeof value === "string" ? value : String(value);

      // Remove surrounding quotes if JSON-stringified
      const clean = parsed.startsWith('"') && parsed.endsWith('"')
        ? JSON.parse(parsed) as string
        : parsed;

      setCache(key, clean);
      return clean;
    } catch (err) {
      logger.error({ key, err }, "Failed to fetch credential from DB");
      return null;
    }
  }

  /**
   * Get credential from DB, falling back to env variable.
   * This is the primary method providers should use.
   */
  async getCredentialOrEnv(key: string): Promise<string> {
    const dbValue = await this.getCredential(key);
    if (dbValue) return dbValue;

    const envKey = CREDENTIAL_ENV_MAP[key];
    if (!envKey) return "";

    return String(config[envKey] ?? "");
  }

  /**
   * Set a credential value in the DB.
   */
  async setCredential(key: string, value: string): Promise<void> {
    if (!CREDENTIAL_KEYS.has(key)) {
      throw new Error(`Invalid credential key: ${key}`);
    }

    await prisma.systemConfig.upsert({
      where: { key: `cred:${key}` },
      update: { value: JSON.stringify(value) },
      create: { key: `cred:${key}`, value: JSON.stringify(value) },
    });

    // Invalidate cache so next read fetches fresh value
    invalidateCache(key);

    logger.info({ key }, "Credential updated via admin UI");
  }

  /**
   * List all credential keys with masked values (for admin GET).
   * Shows "••••xxxx" format — only last 4 chars visible.
   * Returns "env" source if using env fallback, "db" if DB-set.
   */
  async listCredentials(): Promise<
    Array<{
      key: string;
      label: string;
      group: string;
      maskedValue: string;
      source: "db" | "env" | "not_set";
    }>
  > {
    const results: Array<{
      key: string;
      label: string;
      group: string;
      maskedValue: string;
      source: "db" | "env" | "not_set";
    }> = [];

    for (const key of CREDENTIAL_KEYS) {
      const meta = CREDENTIAL_LABELS[key];
      const dbValue = await this.getCredential(key);

      if (dbValue) {
        results.push({
          key,
          label: meta.label,
          group: meta.group,
          maskedValue: maskValue(dbValue),
          source: "db",
        });
        continue;
      }

      // Check env fallback
      const envKey = CREDENTIAL_ENV_MAP[key];
      const envValue = envKey ? String(config[envKey] ?? "") : "";

      if (envValue) {
        results.push({
          key,
          label: meta.label,
          group: meta.group,
          maskedValue: maskValue(envValue),
          source: "env",
        });
      } else {
        results.push({
          key,
          label: meta.label,
          group: meta.group,
          maskedValue: "",
          source: "not_set",
        });
      }
    }

    return results;
  }
}

/**
 * Mask a credential value for display. Shows last 4 chars only.
 * E.g. "sk-proj-abc123xyz" → "••••••xyz"
 */
function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

export const credentialService = new CredentialService();
