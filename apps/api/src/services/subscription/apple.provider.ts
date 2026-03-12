/**
 * Apple Subscription Provider
 *
 * Implements SubscriptionProviderInterface using Apple App Store
 * Server API and JWS verification.
 */

import type { SubscriptionProviderInterface } from "./provider.interface.js";
import type {
  VerifiedTransaction,
  SubscriptionStatusResult,
  WebhookEvent,
} from "../apple/apple-types.js";
import {
  decodeSignedTransaction,
  mapToVerifiedTransaction,
  getSubscriptionStatus,
  decodeWebhookEvent,
} from "../apple/apple-api.js";

export class AppleSubscriptionProvider implements SubscriptionProviderInterface {
  /**
   * Verify a purchase by decoding and validating the signedTransactionInfo
   * sent by the iOS client after a successful StoreKit purchase.
   */
  async verifyPurchase(signedTransactionInfo: string): Promise<VerifiedTransaction> {
    // Decode with full JWS verification
    const txInfo = decodeSignedTransaction(signedTransactionInfo, true);
    return mapToVerifiedTransaction(txInfo);
  }

  /**
   * Get subscription status directly from Apple's API.
   * Used for soft-verification when local balance is expired but
   * subscription might still be active (missed webhook scenario).
   */
  async getSubscriptionStatus(
    originalTransactionId: string
  ): Promise<SubscriptionStatusResult> {
    return getSubscriptionStatus(originalTransactionId);
  }

  /**
   * Decode and verify an Apple V2 server notification webhook.
   * Validates JWS signature, environment, and bundle ID.
   */
  async decodeWebhookPayload(signedPayload: string): Promise<WebhookEvent> {
    return decodeWebhookEvent(signedPayload, true);
  }
}

/** Singleton instance */
export const appleProvider = new AppleSubscriptionProvider();
