/**
 * Apple App Store Server API — TypeScript types
 *
 * Based on Apple's App Store Server Notifications V2 and
 * App Store Server API documentation.
 *
 * @see https://developer.apple.com/documentation/appstoreservernotifications
 * @see https://developer.apple.com/documentation/appstoreserverapi
 */

// ─── Notification V2 Types ──────────────────────────────────

/** Top-level signed notification payload from Apple */
export interface AppleNotificationPayload {
  notificationType: AppleNotificationType;
  subtype?: AppleNotificationSubtype;
  notificationUUID: string;
  data: AppleNotificationData;
  version: string;
  signedDate: number;
}

export interface AppleNotificationData {
  appAppleId: number;
  bundleId: string;
  bundleVersion: string;
  environment: AppleEnvironment;
  signedTransactionInfo: string; // JWS
  signedRenewalInfo?: string;   // JWS
}

export type AppleEnvironment = "Sandbox" | "Production";

export type AppleNotificationType =
  | "CONSUMPTION_REQUEST"
  | "DID_CHANGE_RENEWAL_PREF"
  | "DID_CHANGE_RENEWAL_STATUS"
  | "DID_FAIL_TO_RENEW"
  | "DID_RENEW"
  | "EXPIRED"
  | "GRACE_PERIOD_EXPIRE"
  | "OFFER_REDEEMED"
  | "PRICE_INCREASE"
  | "REFUND"
  | "REFUND_DECLINED"
  | "REFUND_REVERSED"
  | "RENEWAL_EXTENDED"
  | "REVOKE"
  | "SUBSCRIBED"
  | "TEST";

export type AppleNotificationSubtype =
  | "INITIAL_BUY"
  | "RESUBSCRIBE"
  | "DOWNGRADE"
  | "UPGRADE"
  | "AUTO_RENEW_ENABLED"
  | "AUTO_RENEW_DISABLED"
  | "VOLUNTARY"
  | "BILLING_RETRY_PERIOD"
  | "PRICE_INCREASE"
  | "GRACE_PERIOD"
  | "PENDING"
  | "ACCEPTED";

// ─── JWS Decoded Transaction Info ───────────────────────────

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier: string;
  purchaseDate: number;           // ms since epoch
  originalPurchaseDate: number;   // ms since epoch
  expiresDate: number;            // ms since epoch
  quantity: number;
  type: "Auto-Renewable Subscription" | "Non-Consumable" | "Consumable" | "Non-Renewing Subscription";
  appAccountToken?: string;
  inAppOwnershipType: "PURCHASED" | "FAMILY_SHARED";
  signedDate: number;
  environment: AppleEnvironment;
  transactionReason?: "PURCHASE" | "RENEWAL";
  storefront: string;
  storefrontId: string;
  price?: number;
  currency?: string;
  offerType?: number;
  offerIdentifier?: string;
  revocationDate?: number;
  revocationReason?: number;
  isUpgraded?: boolean;
}

// ─── JWS Decoded Renewal Info ───────────────────────────────

export interface AppleRenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: 0 | 1;              // 0 = off, 1 = on
  environment: AppleEnvironment;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  offerIdentifier?: string;
  offerType?: number;
  originalTransactionId: string;
  priceIncreaseStatus?: number;
  productId: string;
  recentSubscriptionStartDate?: number;
  renewalDate?: number;
  signedDate: number;
}

// ─── App Store Server API Response Types ────────────────────

export interface AppleSubscriptionStatusResponse {
  environment: AppleEnvironment;
  bundleId: string;
  appAppleId: number;
  data: AppleSubscriptionGroupStatus[];
}

export interface AppleSubscriptionGroupStatus {
  subscriptionGroupIdentifier: string;
  lastTransactions: AppleLastTransaction[];
}

export interface AppleLastTransaction {
  status: AppleSubscriptionApiStatus;
  originalTransactionId: string;
  signedTransactionInfo: string;  // JWS
  signedRenewalInfo: string;      // JWS
}

/** Apple's subscription status codes from the Server API */
export type AppleSubscriptionApiStatus =
  | 1   // Active
  | 2   // Expired
  | 3   // Billing Retry Period
  | 4   // Grace Period
  | 5;  // Revoked

export interface AppleTransactionHistoryResponse {
  environment: AppleEnvironment;
  bundleId: string;
  appAppleId: number;
  hasMore: boolean;
  revision: string;
  signedTransactions: string[];  // Array of JWS strings
}

// ─── JWS Header ─────────────────────────────────────────────

export interface AppleJWSHeader {
  alg: string;    // "ES256"
  x5c: string[];  // Certificate chain (DER base64)
  kid?: string;
}

// ─── Mapped Types for Internal Use ──────────────────────────

/** Verified and decoded transaction ready for service layer */
export interface VerifiedTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: Date;
  expiresDate: Date;
  environment: AppleEnvironment;
  isUpgraded: boolean;
  revocationDate: Date | null;
  type: AppleTransactionInfo["type"];
}

/** Subscription status result from Apple verification */
export interface SubscriptionStatusResult {
  originalTransactionId: string;
  status: AppleSubscriptionApiStatus;
  productId: string;
  expiresDate: Date;
  autoRenewEnabled: boolean;
  environment: AppleEnvironment;
  isInBillingRetry: boolean;
  gracePeriodExpiresDate: Date | null;
}

/** Decoded webhook event ready for routing */
export interface WebhookEvent {
  notificationType: AppleNotificationType;
  subtype: AppleNotificationSubtype | null;
  notificationId: string;
  environment: AppleEnvironment;
  transaction: VerifiedTransaction;
  renewalInfo: AppleRenewalInfo | null;
  rawPayload: Record<string, unknown>;
}
