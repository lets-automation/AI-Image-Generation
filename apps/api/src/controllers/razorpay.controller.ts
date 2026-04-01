/**
 * Razorpay Controller — Handles subscription creation, verification, and webhooks
 */
import type { Request, Response, NextFunction } from "express";
import { razorpayService } from "../services/razorpay/razorpay.service.js";
import { logger } from "../utils/logger.js";

export const razorpayController = {
  /**
   * POST /subscriptions/razorpay/create-subscription
   * Create a Razorpay Subscription (recurring) for a plan
   */
  async createSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).userId;
      const { planId } = req.body;

      if (!planId) {
        res.status(400).json({
          success: false,
          error: { message: "planId is required" },
        });
        return;
      }

      const result = await razorpayService.createSubscription(userId, planId);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /subscriptions/razorpay/verify
   * Verify payment after Razorpay checkout and activate subscription
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).userId;
      const { planId, razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!planId || !razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400).json({
          success: false,
          error: { message: "planId, razorpay_subscription_id, razorpay_payment_id, and razorpay_signature are required" },
        });
        return;
      }

      const result = await razorpayService.verifyAndActivate(userId, planId, {
        razorpay_subscription_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      // Format response to match /subscriptions/status shape
      if (!result) {
        res.json({
          success: true,
          data: {
            hasActiveSubscription: false,
            subscription: null,
            balance: null,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          hasActiveSubscription: true,
          subscription: {
            id: result.subscription.id,
            planId: result.subscription.planId,
            planName: result.subscription.plan.name,
            tierAccess: result.subscription.plan.tierAccess,
            status: result.subscription.status,
            provider: result.subscription.provider,
            currentPeriodStart: result.subscription.currentPeriodStart,
            currentPeriodEnd: result.subscription.currentPeriodEnd,
            autoRenewEnabled: result.subscription.autoRenewEnabled,
            cancellationReason: result.subscription.cancellationReason,
          },
          balance: result.balance
            ? {
                remainingCredits: result.balance.remainingCredits,
                weeklyCredits: result.balance.weeklyCredits,
                periodEnd: result.balance.periodEnd,
              }
            : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

/**
 * Razorpay Webhook Handler
 * POST /webhooks/razorpay
 *
 * Handles Razorpay webhook events for subscription lifecycle:
 * - subscription.authenticated — subscription confirmed
 * - subscription.activated — first payment successful
 * - subscription.charged — recurring payment successful (RENEWAL)
 * - subscription.pending — payment pending/retry
 * - subscription.halted — max retries exhausted (EXPIRE)
 * - subscription.cancelled — user cancelled
 * - payment.captured — payment confirmation
 * - payment.failed — payment failure
 * - refund.created — refund issued
 */
export async function handleRazorpayWebhook(req: Request, res: Response) {
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  // 1. Verify webhook signature
  if (!signature || !(await razorpayService.verifyWebhookSignature(rawBody, signature))) {
    logger.warn("Razorpay webhook signature verification failed");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  // 2. Parse event
  const event = typeof rawBody === "string" ? JSON.parse(rawBody) : req.body;
  const eventType = event?.event;

  logger.info({ eventType }, "Razorpay webhook received");

  // 3. Handle events
  try {
    switch (eventType) {
      // ─── Subscription lifecycle events ──────────────────
      case "subscription.authenticated": {
        const subId = event?.payload?.subscription?.entity?.id;
        logger.info({ razorpaySubscriptionId: subId }, "Razorpay subscription authenticated");
        break;
      }

      case "subscription.activated": {
        const subId = event?.payload?.subscription?.entity?.id;
        logger.info({ razorpaySubscriptionId: subId }, "Razorpay subscription activated (first payment)");
        // First payment is handled by verify flow — just log
        break;
      }

      case "subscription.charged": {
        // RENEWAL — Razorpay successfully charged the user for the next cycle
        const subEntity = event?.payload?.subscription?.entity;
        const paymentEntity = event?.payload?.payment?.entity;
        const razorpaySubscriptionId = subEntity?.id;
        const paymentId = paymentEntity?.id;

        if (razorpaySubscriptionId && paymentId) {
          await razorpayService.handleSubscriptionCharged(
            razorpaySubscriptionId,
            paymentId,
            event?.payload
          );
        } else {
          logger.warn({ eventType, subEntity, paymentEntity }, "subscription.charged missing IDs");
        }
        break;
      }

      case "subscription.pending": {
        // Payment pending/failed — retry will happen
        const subId = event?.payload?.subscription?.entity?.id;
        if (subId) {
          await razorpayService.handleSubscriptionPending(subId);
        }
        break;
      }

      case "subscription.halted": {
        // All payment retries exhausted — expire
        const subId = event?.payload?.subscription?.entity?.id;
        if (subId) {
          await razorpayService.handleSubscriptionHalted(subId);
        }
        break;
      }

      case "subscription.cancelled": {
        // User/admin cancelled the subscription
        const subId = event?.payload?.subscription?.entity?.id;
        if (subId) {
          await razorpayService.handleSubscriptionCancelled(subId);
        }
        break;
      }

      case "subscription.completed": {
        // All billing cycles completed (total_count reached)
        const subId = event?.payload?.subscription?.entity?.id;
        logger.info({ razorpaySubscriptionId: subId }, "Razorpay subscription completed all cycles");
        if (subId) {
          await razorpayService.handleSubscriptionHalted(subId); // Treat as expiry
        }
        break;
      }

      // ─── Payment events (confirmation/logging) ─────────
      case "payment.captured": {
        const paymentId = event?.payload?.payment?.entity?.id;
        logger.info({ paymentId }, "Razorpay payment.captured — confirmation");
        break;
      }

      case "payment.failed": {
        const failedPaymentId = event?.payload?.payment?.entity?.id;
        const errorDescription = event?.payload?.payment?.entity?.error_description;
        logger.warn({ paymentId: failedPaymentId, error: errorDescription }, "Razorpay payment failed");
        break;
      }

      case "refund.created": {
        const refundPaymentId = event?.payload?.refund?.entity?.payment_id;
        const refundAmount = event?.payload?.refund?.entity?.amount;
        logger.info({ paymentId: refundPaymentId, amount: refundAmount }, "Razorpay refund created");
        // TODO: If full refund, revoke subscription
        break;
      }

      default:
        logger.info({ eventType }, "Razorpay webhook event not handled");
    }
  } catch (err) {
    logger.error({ err, eventType }, "Razorpay webhook processing error");
    // Still return 200 to acknowledge receipt
  }

  // Always respond 200 to acknowledge receipt
  res.status(200).json({ status: "ok" });
}
