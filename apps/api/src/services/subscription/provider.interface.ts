/**
 * Subscription Provider Interface
 *
 * Abstraction layer for subscription verification and management.
 * Apple is the first implementation; Google Play can be added later
 * by implementing this same interface.
 */

import type {
  VerifiedTransaction,
  SubscriptionStatusResult,
  WebhookEvent,
} from "../apple/apple-types.js";

export interface SubscriptionProviderInterface {
  /**
   * Verify a purchase receipt/transaction from the client.
   * Called after the client completes a purchase and sends the signed data.
   *
   * @param receipt - Platform-specific receipt data (e.g., signedTransactionInfo for Apple)
   * @returns Verified and decoded transaction info
   */
  verifyPurchase(receipt: string): Promise<VerifiedTransaction>;

  /**
   * Get the current subscription status from the provider.
   * Used for soft-verification and reconciliation.
   *
   * @param originalTransactionId - The original transaction identifier
   * @returns Current subscription status from the provider
   */
  getSubscriptionStatus(
    originalTransactionId: string
  ): Promise<SubscriptionStatusResult>;

  /**
   * Decode and verify a webhook payload from the provider.
   *
   * @param payload - Raw webhook payload (e.g., signedPayload for Apple)
   * @returns Decoded and verified webhook event
   */
  decodeWebhookPayload(payload: string): Promise<WebhookEvent>;
}
