/**
 * Razorpay Controller — Handles payment order creation and verification
 */
import type { Request, Response, NextFunction } from "express";
import { razorpayService } from "../services/razorpay/razorpay.service.js";
import { logger } from "../utils/logger.js";

export const razorpayController = {
  /**
   * POST /subscriptions/razorpay/create-order
   * Create a Razorpay order for a subscription plan
   */
  async createOrder(req: Request, res: Response, next: NextFunction) {
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

      const order = await razorpayService.createOrder(userId, planId);

      res.status(201).json({
        success: true,
        data: order,
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
      const { planId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!planId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400).json({
          success: false,
          error: { message: "planId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required" },
        });
        return;
      }

      const result = await razorpayService.verifyAndActivate(userId, planId, {
        razorpay_order_id,
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
 * Razorpay sends webhook events for payment status changes.
 * This handler verifies the signature and processes the event.
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
  switch (eventType) {
    case "payment.captured": {
      // Payment successful — subscription already activated during verify flow
      // This is a confirmation webhook
      const paymentId = event?.payload?.payment?.entity?.id;
      logger.info({ paymentId }, "Razorpay payment.captured webhook — already handled in verify flow");
      break;
    }

    case "payment.failed": {
      const failedPaymentId = event?.payload?.payment?.entity?.id;
      const errorDescription = event?.payload?.payment?.entity?.error_description;
      logger.warn({ paymentId: failedPaymentId, error: errorDescription }, "Razorpay payment failed");
      // No action needed — user can retry payment from frontend
      break;
    }

    case "refund.created": {
      const refundPaymentId = event?.payload?.refund?.entity?.payment_id;
      const refundAmount = event?.payload?.refund?.entity?.amount;
      logger.info({ paymentId: refundPaymentId, amount: refundAmount }, "Razorpay refund created");
      // TODO: If full refund, revoke subscription. For now, log and handle manually.
      break;
    }

    default:
      logger.info({ eventType }, "Razorpay webhook event not handled");
  }

  // Always respond 200 to acknowledge receipt
  res.status(200).json({ status: "ok" });
}
