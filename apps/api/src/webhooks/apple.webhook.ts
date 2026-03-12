/**
 * Apple App Store Server Notifications V2 — Webhook Handler
 *
 * Receives signed JWS payloads from Apple, verifies the signature +
 * certificate chain, routes by notification type to the subscription
 * state machine, and stores the event for audit.
 *
 * Design principles:
 * - Return 200 ASAP (Apple retries on non-2xx)
 * - Never block the response on heavy processing
 * - Idempotent: duplicate notificationIds are detected and skipped
 * - Environment isolation: reject events where env doesn't match config
 *
 * @see https://developer.apple.com/documentation/appstoreservernotifications
 */

import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { decodeWebhookEvent } from "../services/apple/apple-api.js";
import { subscriptionService } from "../services/subscription.service.js";
import { auditService } from "../services/audit.service.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../config/database.js";
import { getRedis } from "../config/redis.js";
import type { WebhookEvent } from "../services/apple/apple-types.js";

// ─── Rate Limiter (Apple webhook protection) ─────────────────

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 req/min from Apple
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Webhook rate limit exceeded",
    },
  },
});

// ─── Recovery Queue Key ──────────────────────────────────────

const RECOVERY_QUEUE_KEY = "webhook:apple:recovery";

// ─── Router ──────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/v1/webhooks/apple
 *
 * Apple sends: { signedPayload: string }
 * No JWT auth — verification is via JWS signature on the payload.
 */
router.post("/apple", webhookLimiter, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { signedPayload } = req.body as { signedPayload?: string };

    if (!signedPayload || typeof signedPayload !== "string") {
      logger.warn("Apple webhook received without signedPayload");
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing signedPayload" },
      });
      return;
    }

    // ─── Step 1: Decode & verify JWS ─────────────────────────
    let event: WebhookEvent;
    try {
      event = decodeWebhookEvent(signedPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown verification error";

      // Environment or bundleId mismatch — 200 to prevent retries, but log error
      if (message.includes("mismatch")) {
        logger.error({ err: message }, "Apple webhook environment/bundle mismatch — dropping");
        res.status(200).json({ success: true });
        return;
      }

      // JWS signature failure — 400 (not retryable)
      logger.error({ err: message }, "Apple webhook JWS verification failed");
      res.status(400).json({
        success: false,
        error: { code: "INVALID_SIGNATURE", message: "JWS verification failed" },
      });
      return;
    }

    logger.info(
      {
        notificationType: event.notificationType,
        subtype: event.subtype,
        notificationId: event.notificationId,
        originalTxId: event.transaction.originalTransactionId,
        environment: event.environment,
      },
      "Apple webhook received"
    );

    // ─── Step 2: Idempotency check ──────────────────────────
    const isDuplicate = await checkIdempotency(event.notificationId);
    if (isDuplicate) {
      logger.info(
        { notificationId: event.notificationId },
        "Duplicate Apple webhook — already processed"
      );
      res.status(200).json({ success: true });
      return;
    }

    // ─── Step 3: Route & process ────────────────────────────
    try {
      await routeNotification(event);
    } catch (err) {
      // If DB is down or processing fails, push to recovery queue
      // but still return 200 to Apple (we'll retry internally)
      logger.error(
        {
          err,
          notificationType: event.notificationType,
          notificationId: event.notificationId,
          originalTxId: event.transaction.originalTransactionId,
        },
        "Apple webhook processing failed — queuing for recovery"
      );

      await pushToRecoveryQueue(signedPayload, event.notificationId);
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      { notificationId: event.notificationId, elapsed },
      "Apple webhook processed"
    );

    // Always return 200 after event is stored/queued
    res.status(200).json({ success: true });
  } catch (err) {
    // Catch-all — log and return 200 to prevent Apple retries
    // for truly unexpected errors
    logger.error({ err }, "Apple webhook unexpected error");
    res.status(200).json({ success: true });
  }
});

// ─── Notification Routing ────────────────────────────────────

/**
 * Route an Apple notification to the appropriate subscription service handler.
 *
 * | Apple Notification               | Handler                                       |
 * |----------------------------------|-----------------------------------------------|
 * | SUBSCRIBED (INITIAL_BUY)         | activateSubscription (requires userId via DB)  |
 * | SUBSCRIBED (RESUBSCRIBE)         | activateSubscription (via existing sub lookup)  |
 * | DID_RENEW                        | handleRenewal                                  |
 * | DID_FAIL_TO_RENEW                | handleBillingRetry                             |
 * | GRACE_PERIOD_EXPIRE              | handleGracePeriod                              |
 * | EXPIRED                          | handleExpire                                   |
 * | REFUND                           | handleRefund                                   |
 * | REVOKE                           | handleRefund (same treatment)                  |
 * | DID_CHANGE_RENEWAL_STATUS        | handleCancel (if autoRenew disabled)            |
 * | DID_CHANGE_RENEWAL_PREF (DOWN)   | handleDowngrade                                |
 * | DID_CHANGE_RENEWAL_PREF (UP)     | handleUpgrade                                  |
 */
async function routeNotification(event: WebhookEvent): Promise<void> {
  const { notificationType, subtype, transaction, renewalInfo } = event;
  const originalTxId = transaction.originalTransactionId;

  // ─── Pre-lookup: find subscription by originalTransactionId ───
  // Most notification types require an existing subscription.
  // SUBSCRIBED/INITIAL_BUY is the exception — subscription may not exist yet.
  const existingSub = await prisma.subscription.findUnique({
    where: { originalTransactionId: originalTxId },
    select: { id: true, userId: true },
  });

  let subscriptionId: string | null = existingSub?.id ?? null;
  let userId: string | null = existingSub?.userId ?? null;

  switch (notificationType) {
    // ─── New subscription ────────────────────────────────
    case "SUBSCRIBED": {
      if (subtype === "INITIAL_BUY") {
        if (existingSub) {
          // Already activated via verify endpoint — just log
          logger.info(
            { subscriptionId, originalTxId },
            "SUBSCRIBED/INITIAL_BUY — subscription already exists"
          );
        } else {
          // No subscription yet — client hasn't called verify.
          // We can't create it without userId, so store for reconciliation.
          logger.warn(
            { originalTxId, productId: transaction.productId },
            "SUBSCRIBED/INITIAL_BUY — no subscription found. " +
            "Client verify endpoint will create it. Storing event for reconciliation."
          );
          await storeOrphanedEvent(event);
          return;
        }
      } else if (subtype === "RESUBSCRIBE") {
        if (existingSub) {
          await subscriptionService.activateSubscription(
            existingSub.userId,
            transaction
          );
        } else {
          logger.warn(
            { originalTxId },
            "SUBSCRIBED/RESUBSCRIBE — no previous subscription found"
          );
          await storeOrphanedEvent(event);
          return;
        }
      }
      break;
    }

    // ─── Renewal ─────────────────────────────────────────
    case "DID_RENEW": {
      await subscriptionService.handleRenewal(originalTxId, transaction);
      break;
    }

    // ─── Billing retry ───────────────────────────────────
    case "DID_FAIL_TO_RENEW": {
      if (subtype === "GRACE_PERIOD") {
        await subscriptionService.handleGracePeriod(originalTxId);
      } else {
        await subscriptionService.handleBillingRetry(originalTxId);
      }
      break;
    }

    // ─── Grace period expired ────────────────────────────
    case "GRACE_PERIOD_EXPIRE": {
      await subscriptionService.handleExpire(originalTxId);
      break;
    }

    // ─── Expired ─────────────────────────────────────────
    case "EXPIRED": {
      await subscriptionService.handleExpire(originalTxId);
      break;
    }

    // ─── Refund / Revoke ─────────────────────────────────
    case "REFUND":
    case "REVOKE": {
      await subscriptionService.handleRefund(originalTxId);
      break;
    }

    // ─── Cancel (auto-renew toggled off) ─────────────────
    case "DID_CHANGE_RENEWAL_STATUS": {
      if (subtype === "AUTO_RENEW_DISABLED") {
        await subscriptionService.handleCancel(originalTxId, "User disabled auto-renew");
      }
      // AUTO_RENEW_ENABLED — no state change needed, just log
      break;
    }

    // ─── Plan change (upgrade/downgrade) ─────────────────
    case "DID_CHANGE_RENEWAL_PREF": {
      if (subtype === "UPGRADE") {
        await subscriptionService.handleUpgrade(originalTxId, transaction);
      } else if (subtype === "DOWNGRADE") {
        const newProductId = renewalInfo?.autoRenewProductId ?? transaction.productId;
        await subscriptionService.handleDowngrade(originalTxId, newProductId);
      }
      break;
    }

    // ─── Non-actionable notifications ────────────────────
    case "CONSUMPTION_REQUEST":
    case "OFFER_REDEEMED":
    case "PRICE_INCREASE":
    case "REFUND_DECLINED":
    case "REFUND_REVERSED":
    case "RENEWAL_EXTENDED":
    case "TEST": {
      logger.info(
        { notificationType, subtype, originalTxId },
        "Non-actionable Apple notification — logged only"
      );
      break;
    }

    default: {
      logger.warn(
        { notificationType, subtype, originalTxId },
        "Unknown Apple notification type"
      );
    }
  }

  // ─── Step 4: Store event ─────────────────────────────────
  if (subscriptionId) {
    await subscriptionService.storeEvent(
      subscriptionId,
      event.notificationId,
      mapNotificationToEventType(notificationType, subtype),
      transaction.transactionId,
      new Date(),
      event.rawPayload
    );
  }

  // ─── Step 5: Audit log ──────────────────────────────────
  await auditService.logSubscriptionAction(
    userId ?? "system",
    notificationType,
    subscriptionId ?? originalTxId,
    { notificationType, subtype, originalTxId, environment: event.environment }
  );
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check if a notification ID has already been processed.
 * First check Redis (fast), then fall back to DB.
 */
async function checkIdempotency(notificationId: string): Promise<boolean> {
  // Fast check: Redis set
  try {
    const redis = getRedis();
    const exists = await redis.sismember("webhook:apple:processed", notificationId);
    if (exists) return true;
  } catch {
    // Redis down — fall through to DB check
  }

  // DB check: SubscriptionEvent with this notificationId
  const existing = await prisma.subscriptionEvent.findUnique({
    where: { notificationId },
    select: { id: true },
  });

  if (existing) {
    // Mark in Redis for faster future checks
    try {
      const redis = getRedis();
      await redis.sadd("webhook:apple:processed", notificationId);
    } catch {
      // Non-critical
    }
    return true;
  }

  return false;
}

/**
 * Store orphaned event (subscription not yet created) for
 * the reconciliation job to pick up later.
 */
async function storeOrphanedEvent(event: WebhookEvent): Promise<void> {
  try {
    const redis = getRedis();
    await redis.rpush(
      RECOVERY_QUEUE_KEY,
      JSON.stringify({
        notificationId: event.notificationId,
        notificationType: event.notificationType,
        subtype: event.subtype,
        originalTransactionId: event.transaction.originalTransactionId,
        transaction: event.transaction,
        rawPayload: event.rawPayload,
        receivedAt: new Date().toISOString(),
      })
    );
    logger.info(
      { notificationId: event.notificationId },
      "Orphaned webhook event pushed to recovery queue"
    );
  } catch (err) {
    // If Redis is also down, log the event details for manual recovery
    logger.error(
      {
        err,
        notificationId: event.notificationId,
        notificationType: event.notificationType,
        originalTxId: event.transaction.originalTransactionId,
      },
      "Failed to push orphaned event to recovery queue — manual recovery needed"
    );
  }
}

/**
 * Push a failed webhook payload to Redis recovery queue for internal retry.
 */
async function pushToRecoveryQueue(
  signedPayload: string,
  notificationId: string
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.rpush(
      RECOVERY_QUEUE_KEY,
      JSON.stringify({
        signedPayload,
        notificationId,
        failedAt: new Date().toISOString(),
        retryCount: 0,
      })
    );
  } catch (err) {
    logger.error(
      { err, notificationId },
      "Failed to push to recovery queue — event may be lost"
    );
  }
}

/**
 * Map Apple notification type + subtype to our SubscriptionEventType enum.
 */
function mapNotificationToEventType(
  notificationType: string,
  subtype: string | null
): string {
  switch (notificationType) {
    case "SUBSCRIBED":
      return subtype === "RESUBSCRIBE" ? "INITIAL_BUY" : "INITIAL_BUY";
    case "DID_RENEW":
      return "RENEWAL";
    case "DID_FAIL_TO_RENEW":
      return subtype === "GRACE_PERIOD" ? "GRACE_PERIOD_START" : "BILLING_RETRY_START";
    case "GRACE_PERIOD_EXPIRE":
      return "EXPIRE";
    case "EXPIRED":
      return "EXPIRE";
    case "REFUND":
      return "REFUND";
    case "REVOKE":
      return "REVOKE";
    case "DID_CHANGE_RENEWAL_STATUS":
      return subtype === "AUTO_RENEW_DISABLED" ? "CANCEL" : "RENEWAL";
    case "DID_CHANGE_RENEWAL_PREF":
      return subtype === "UPGRADE" ? "UPGRADE" : "DOWNGRADE";
    default:
      return "INITIAL_BUY"; // Fallback for non-actionable types stored as events
  }
}

export { router as appleWebhookRoutes };
