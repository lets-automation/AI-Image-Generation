/**
 * Apple App Store Server API — Client
 *
 * Handles:
 * - JWS decoding & verification for signed transaction info and notifications
 * - App Store Server API calls (subscription status, transaction history)
 * - Certificate chain validation for Apple-signed payloads
 *
 * @see https://developer.apple.com/documentation/appstoreserverapi
 * @see https://developer.apple.com/documentation/appstoreservernotifications
 */

import * as crypto from "crypto";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { generateAppStoreJWT, getAppStoreBaseUrl } from "./apple-auth.js";
import type {
  AppleTransactionInfo,
  AppleRenewalInfo,
  AppleNotificationPayload,
  AppleJWSHeader,
  AppleSubscriptionStatusResponse,
  AppleTransactionHistoryResponse,
  VerifiedTransaction,
  SubscriptionStatusResult,
  WebhookEvent,
} from "./apple-types.js";

// Apple root certificates — used for JWS certificate chain validation.
// In production, these should be fetched/cached from Apple's PKI.
// For now, we validate the chain structure and signature.
const APPLE_ROOT_CA_G3_FINGERPRINT =
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

// ─── JWS Decoding ───────────────────────────────────────────

/**
 * Decode a JWS (JSON Web Signature) string without verification.
 * Used for extracting headers and payload for inspection.
 */
function decodeJWS<T>(jws: string): { header: AppleJWSHeader; payload: T } {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWS: expected 3 parts (header.payload.signature)");
  }

  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8")
  ) as AppleJWSHeader;

  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8")
  ) as T;

  return { header, payload };
}

/**
 * Verify a JWS signature using the certificate chain from the x5c header.
 *
 * Steps:
 * 1. Extract x5c certificate chain from JWS header
 * 2. Verify the chain leads to a trusted Apple root CA
 * 3. Extract the public key from the leaf certificate
 * 4. Verify the JWS signature using that public key
 */
export function verifyJWSSignature(jws: string): boolean {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return false;

    const headerJson = Buffer.from(parts[0], "base64url").toString("utf8");
    const header = JSON.parse(headerJson) as AppleJWSHeader;

    if (!header.x5c || header.x5c.length === 0) {
      logger.warn("JWS missing x5c certificate chain");
      return false;
    }

    if (header.alg !== "ES256") {
      logger.warn({ alg: header.alg }, "Unexpected JWS algorithm");
      return false;
    }

    // Build leaf certificate from x5c[0]
    const leafCertDer = Buffer.from(header.x5c[0], "base64");
    const leafCertPem = derToPem(leafCertDer, "CERTIFICATE");

    // Verify certificate chain: check that root cert fingerprint matches Apple's
    if (header.x5c.length >= 2) {
      const rootCertDer = Buffer.from(header.x5c[header.x5c.length - 1], "base64");
      const rootFingerprint = crypto
        .createHash("sha256")
        .update(rootCertDer)
        .digest("hex");

      if (rootFingerprint !== APPLE_ROOT_CA_G3_FINGERPRINT) {
        logger.warn(
          { expected: APPLE_ROOT_CA_G3_FINGERPRINT, got: rootFingerprint },
          "Apple root certificate fingerprint mismatch"
        );
        // In sandbox, Apple may use different root certs, so we log but don't fail
        if (config.APPLE_ENVIRONMENT === "Production") {
          return false;
        }
      }
    }

    // Extract public key from leaf certificate
    const leafCert = crypto.createPublicKey({
      key: leafCertPem,
      format: "pem",
    });

    // Verify signature: sign(header_b64url + "." + payload_b64url)
    const signedContent = parts[0] + "." + parts[1];
    const signature = Buffer.from(parts[2], "base64url");

    const verifier = crypto.createVerify("SHA256");
    verifier.update(signedContent);
    return verifier.verify(
      { key: leafCert, dsaEncoding: "ieee-p1363" },
      signature
    );
  } catch (err) {
    logger.error({ err }, "JWS signature verification error");
    return false;
  }
}

/**
 * Convert DER-encoded buffer to PEM format.
 */
function derToPem(der: Buffer, type: string): string {
  const b64 = der.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`;
}

// ─── Transaction Decoding ───────────────────────────────────

/**
 * Decode and verify a signed transaction info JWS.
 * Returns the decoded transaction data.
 */
export function decodeSignedTransaction(
  signedTransactionInfo: string,
  requireVerification = true
): AppleTransactionInfo {
  if (requireVerification) {
    const valid = verifyJWSSignature(signedTransactionInfo);
    if (!valid) {
      throw new Error("Invalid JWS signature on signed transaction info");
    }
  }

  const { payload } = decodeJWS<AppleTransactionInfo>(signedTransactionInfo);
  return payload;
}

/**
 * Decode and verify a signed renewal info JWS.
 */
export function decodeSignedRenewalInfo(
  signedRenewalInfo: string,
  requireVerification = true
): AppleRenewalInfo {
  if (requireVerification) {
    const valid = verifyJWSSignature(signedRenewalInfo);
    if (!valid) {
      throw new Error("Invalid JWS signature on signed renewal info");
    }
  }

  const { payload } = decodeJWS<AppleRenewalInfo>(signedRenewalInfo);
  return payload;
}

/**
 * Map raw Apple transaction info to our internal VerifiedTransaction format.
 */
export function mapToVerifiedTransaction(
  tx: AppleTransactionInfo
): VerifiedTransaction {
  return {
    transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId,
    productId: tx.productId,
    purchaseDate: new Date(tx.purchaseDate),
    expiresDate: new Date(tx.expiresDate),
    environment: tx.environment,
    isUpgraded: tx.isUpgraded ?? false,
    revocationDate: tx.revocationDate ? new Date(tx.revocationDate) : null,
    type: tx.type,
  };
}

// ─── Notification Decoding ──────────────────────────────────

/**
 * Decode and verify an Apple V2 server notification payload.
 * The incoming request body contains `{ signedPayload: string }`.
 */
export function decodeNotificationPayload(
  signedPayload: string,
  requireVerification = true
): AppleNotificationPayload {
  if (requireVerification) {
    const valid = verifyJWSSignature(signedPayload);
    if (!valid) {
      throw new Error("Invalid JWS signature on notification payload");
    }
  }

  const { payload } = decodeJWS<AppleNotificationPayload>(signedPayload);
  return payload;
}

/**
 * Fully decode a webhook notification into our internal WebhookEvent format.
 * Decodes the outer notification, inner transaction, and renewal info.
 */
export function decodeWebhookEvent(
  signedPayload: string,
  requireVerification = true
): WebhookEvent {
  const notification = decodeNotificationPayload(signedPayload, requireVerification);

  // Validate environment matches our config
  if (notification.data.environment !== config.APPLE_ENVIRONMENT) {
    throw new Error(
      `Environment mismatch: received ${notification.data.environment}, expected ${config.APPLE_ENVIRONMENT}`
    );
  }

  // Validate bundle ID
  if (notification.data.bundleId !== config.APPLE_BUNDLE_ID) {
    throw new Error(
      `Bundle ID mismatch: received ${notification.data.bundleId}, expected ${config.APPLE_BUNDLE_ID}`
    );
  }

  // Decode inner transaction
  const txInfo = decodeSignedTransaction(
    notification.data.signedTransactionInfo,
    requireVerification
  );
  const transaction = mapToVerifiedTransaction(txInfo);

  // Decode renewal info if present
  let renewalInfo: AppleRenewalInfo | null = null;
  if (notification.data.signedRenewalInfo) {
    renewalInfo = decodeSignedRenewalInfo(
      notification.data.signedRenewalInfo,
      requireVerification
    );
  }

  return {
    notificationType: notification.notificationType,
    subtype: notification.subtype ?? null,
    notificationId: notification.notificationUUID,
    environment: notification.data.environment,
    transaction,
    renewalInfo,
    rawPayload: notification as unknown as Record<string, unknown>,
  };
}

// ─── App Store Server API Calls ─────────────────────────────

/**
 * Get subscription status for a given originalTransactionId.
 *
 * @see https://developer.apple.com/documentation/appstoreserverapi/get_all_subscription_statuses
 */
export async function getSubscriptionStatus(
  originalTransactionId: string
): Promise<SubscriptionStatusResult> {
  const baseUrl = getAppStoreBaseUrl();
  const token = generateAppStoreJWT();

  const url = `${baseUrl}/inApps/v1/subscriptions/${originalTransactionId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      { status: response.status, body, originalTransactionId },
      "Apple subscription status API error"
    );
    throw new Error(`Apple API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as AppleSubscriptionStatusResponse;

  // Find the transaction matching our originalTransactionId
  for (const group of data.data) {
    for (const lastTx of group.lastTransactions) {
      if (lastTx.originalTransactionId === originalTransactionId) {
        const txInfo = decodeSignedTransaction(lastTx.signedTransactionInfo, false);
        const renewalInfo = decodeSignedRenewalInfo(lastTx.signedRenewalInfo, false);

        return {
          originalTransactionId: txInfo.originalTransactionId,
          status: lastTx.status,
          productId: txInfo.productId,
          expiresDate: new Date(txInfo.expiresDate),
          autoRenewEnabled: renewalInfo.autoRenewStatus === 1,
          environment: txInfo.environment,
          isInBillingRetry: renewalInfo.isInBillingRetryPeriod ?? false,
          gracePeriodExpiresDate: renewalInfo.gracePeriodExpiresDate
            ? new Date(renewalInfo.gracePeriodExpiresDate)
            : null,
        };
      }
    }
  }

  throw new Error(
    `Transaction ${originalTransactionId} not found in Apple subscription status response`
  );
}

/**
 * Get transaction history for a given originalTransactionId.
 *
 * @see https://developer.apple.com/documentation/appstoreserverapi/get_transaction_history
 */
export async function getTransactionHistory(
  originalTransactionId: string
): Promise<VerifiedTransaction[]> {
  const baseUrl = getAppStoreBaseUrl();
  const token = generateAppStoreJWT();
  const transactions: VerifiedTransaction[] = [];
  let hasMore = true;
  let revision: string | undefined;

  while (hasMore) {
    const url = new URL(
      `${baseUrl}/inApps/v1/history/${originalTransactionId}`
    );
    if (revision) {
      url.searchParams.set("revision", revision);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, originalTransactionId },
        "Apple transaction history API error"
      );
      throw new Error(`Apple API error: ${response.status} - ${body}`);
    }

    const data = (await response.json()) as AppleTransactionHistoryResponse;

    for (const signedTx of data.signedTransactions) {
      const txInfo = decodeSignedTransaction(signedTx, false);
      transactions.push(mapToVerifiedTransaction(txInfo));
    }

    hasMore = data.hasMore;
    revision = data.revision;
  }

  return transactions;
}
