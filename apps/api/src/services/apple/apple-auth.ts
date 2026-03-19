/**
 * Apple App Store Server API — Authentication
 *
 * Generates short-lived JWTs (ES256) for authenticating with the
 * App Store Server API. Apple requires a JWT signed with the private
 * key associated with the API key configured in App Store Connect.
 *
 * @see https://developer.apple.com/documentation/appstoreserverapi/generating_tokens_for_api_requests
 */

import jwt from "jsonwebtoken";
import { credentialService } from "../credential.service.js";

const TOKEN_TTL_SECONDS = 3600; // 1 hour max per Apple docs
const TOKEN_AUDIENCE = "appstoreconnect-v1";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Ensure the private key is in PEM format.
 * If it's raw base64 (no PEM header), wraps it with PKCS#8 headers.
 * Also handles escaped newlines from .env files.
 */
function ensurePemFormat(key: string): string {
  let k = key.trim();

  // Replace escaped newlines with real newlines
  k = k.replace(/\\n/g, "\n");

  // Already has PEM header — return as-is
  if (k.startsWith("-----BEGIN")) {
    return k;
  }

  // Raw base64 — wrap with PKCS#8 PEM headers (required for ES256)
  // Remove any whitespace/newlines in the raw base64
  const raw = k.replace(/\s+/g, "");

  // Split into 64-char lines per PEM spec
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i += 64) {
    lines.push(raw.substring(i, i + 64));
  }

  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

/**
 * Generate a JWT for App Store Server API requests.
 *
 * Caches the token until 5 minutes before expiry to avoid
 * generating a new one on every API call.
 */
export async function generateAppStoreJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  const APPLE_KEY_ID = await credentialService.getCredentialOrEnv("apple_key_id");
  const APPLE_ISSUER_ID = await credentialService.getCredentialOrEnv("apple_issuer_id");
  const APPLE_BUNDLE_ID = await credentialService.getCredentialOrEnv("apple_bundle_id");
  const APPLE_PRIVATE_KEY = await credentialService.getCredentialOrEnv("apple_private_key");

  if (!APPLE_KEY_ID || !APPLE_ISSUER_ID || !APPLE_PRIVATE_KEY) {
    throw new Error(
      "Apple App Store configuration incomplete. Set APPLE_KEY_ID, APPLE_ISSUER_ID, and APPLE_PRIVATE_KEY."
    );
  }

  const pemKey = ensurePemFormat(APPLE_PRIVATE_KEY);

  const payload = {
    iss: APPLE_ISSUER_ID,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    aud: TOKEN_AUDIENCE,
    bid: APPLE_BUNDLE_ID,
  };

  const token = jwt.sign(payload, pemKey, {
    algorithm: "ES256",
    header: {
      alg: "ES256",
      kid: APPLE_KEY_ID,
      typ: "JWT",
    },
  });

  cachedToken = { token, expiresAt: now + TOKEN_TTL_SECONDS };

  return token;
}

/**
 * Get the base URL for the App Store Server API based on environment.
 */
export async function getAppStoreBaseUrl(): Promise<string> {
  const env = await credentialService.getCredentialOrEnv("apple_environment");
  return env === "Production"
    ? "https://api.storekit.itunes.apple.com"
    : "https://api.storekit-sandbox.itunes.apple.com";
}

/**
 * Invalidate the cached JWT (useful when key is rotated).
 */
export function invalidateTokenCache(): void {
  cachedToken = null;
}
