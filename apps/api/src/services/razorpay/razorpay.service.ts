/**
 * Razorpay Service — Order Creation & Payment Verification
 *
 * Handles Razorpay payment flow for web subscription purchases:
 * 1. Create Razorpay order for a subscription plan
 * 2. Verify payment signature after checkout
 * 3. Activate subscription on successful verification
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { config } from "../../config/index.js";
import { credentialService } from "../credential.service.js";
import { prisma } from "../../config/database.js";
import { logger } from "../../utils/logger.js";
import { BadRequestError, NotFoundError, ServiceUnavailableError } from "../../utils/errors.js";
import { subscriptionService } from "../subscription.service.js";

// ─── Razorpay Instance ───────────────────────────────────

let razorpayInstance: InstanceType<typeof Razorpay> | null = null;
let cachedKeyId: string | null = null;
let cachedKeySecret: string | null = null;

async function getRazorpay(): Promise<InstanceType<typeof Razorpay>> {
  const keyId = await credentialService.getCredentialOrEnv("razorpay_key_id");
  const keySecret = await credentialService.getCredentialOrEnv("razorpay_key_secret");

  if (!keyId || !keySecret) {
    logger.error(
      { hasKeyId: !!keyId, hasKeySecret: !!keySecret },
      "Razorpay credentials missing"
    );
    throw new ServiceUnavailableError(
      "Payment service is not configured. Please contact support."
    );
  }

  // Recreate instance if credentials changed
  if (!razorpayInstance || cachedKeyId !== keyId || cachedKeySecret !== keySecret) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    cachedKeyId = keyId;
    cachedKeySecret = keySecret;
  }

  return razorpayInstance;
}

// ─── Types ───────────────────────────────────────────────

interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  planId: string;
  planName: string;
  keyId: string;
}

interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// ─── Service ─────────────────────────────────────────────

export class RazorpayService {
  /**
   * Create a Razorpay order for a subscription plan purchase.
   *
   * @param userId - The authenticated user's ID
   * @param planId - The SubscriptionPlan ID from our database
   * @returns Order details for the Razorpay checkout on frontend
   */
  async createOrder(userId: string, planId: string): Promise<CreateOrderResult> {
    // 1. Look up the subscription plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundError("Subscription plan");
    }

    // 2. Check if user already has an active subscription
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "GRACE_PERIOD", "BILLING_RETRY"] },
      },
    });

    if (existingSub) {
      throw new BadRequestError(
        "You already have an active subscription. Wait for it to expire or contact support to change plans."
      );
    }

    // 3. Create Razorpay order
    const razorpay = await getRazorpay();
    const keyId = await credentialService.getCredentialOrEnv("razorpay_key_id");

    let order;
    try {
      order = await razorpay.orders.create({
        amount: plan.priceInr, // Already in paise
        currency: "INR",
        receipt: `sub_${userId.slice(-8)}_${Date.now()}`,
        notes: {
          userId,
          planId: plan.id,
          planName: plan.name,
        },
      });
    } catch (rzpError: any) {
      logger.error(
        {
          userId,
          planId: plan.id,
          amount: plan.priceInr,
          razorpayError: rzpError?.message || rzpError,
          statusCode: rzpError?.statusCode,
          errorDescription: rzpError?.error?.description,
        },
        "Razorpay order creation failed"
      );
      throw new ServiceUnavailableError(
        rzpError?.error?.description || "Payment service temporarily unavailable. Please try again."
      );
    }

    logger.info(
      { userId, planId: plan.id, orderId: order.id, amount: plan.priceInr },
      "Razorpay order created"
    );

    return {
      orderId: order.id,
      amount: plan.priceInr,
      currency: "INR",
      planId: plan.id,
      planName: plan.name,
      keyId,
    };
  }

  /**
   * Verify Razorpay payment signature and activate the subscription.
   *
   * Called after user completes Razorpay checkout on frontend.
   *
   * @param userId - The authenticated user's ID
   * @param planId - The SubscriptionPlan ID
   * @param payment - Razorpay payment response data
   */
  async verifyAndActivate(
    userId: string,
    planId: string,
    payment: VerifyPaymentInput
  ) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payment;

    // 1. Verify signature
    const keySecret = await credentialService.getCredentialOrEnv("razorpay_key_secret");
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      logger.warn(
        { userId, razorpay_order_id, razorpay_payment_id },
        "Razorpay payment signature verification failed"
      );
      throw new BadRequestError("Payment verification failed — invalid signature");
    }

    // 2. Look up the plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundError("Subscription plan");
    }

    // 3. Check for duplicate payment (idempotency)
    const existingByPayment = await prisma.subscription.findFirst({
      where: { razorpayPaymentId: razorpay_payment_id } as any,
    });

    if (existingByPayment) {
      logger.info(
        { razorpay_payment_id, subscriptionId: existingByPayment.id },
        "Razorpay payment already processed — idempotent"
      );
      return subscriptionService.getActiveSubscription(userId);
    }

    // 4. Activate subscription via the subscription service
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week

    const subscription = await prisma.$transaction(async (tx) => {
      // Close any existing expired/cancelled subscriptions' balances
      await tx.subscriptionBalance.updateMany({
        where: { userId, isClosed: false },
        data: { isClosed: true },
      });

      // Create new subscription
      const sub = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          provider: "RAZORPAY" as any,
          originalTransactionId: razorpay_payment_id,    // Use payment_id as unique identifier
          latestTransactionId: razorpay_payment_id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenewEnabled: true,                        // Auto-renew by default; user can cancel
          lastRenewalDate: now,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          environment: config.NODE_ENV === "production" ? "Production" : "Sandbox",
        } as any,
      });

      // Create subscription balance
      await tx.subscriptionBalance.create({
        data: {
          userId,
          subscriptionId: sub.id,
          periodStart: now,
          periodEnd,
          weeklyCredits: plan.weeklyCredits,
          usedCredits: 0,
          remainingCredits: plan.weeklyCredits,
          isClosed: false,
        },
      });

      // Log subscription event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          eventType: "INITIAL_BUY",
          transactionId: razorpay_payment_id,
          effectiveDate: now,
          payload: {
            provider: "RAZORPAY",
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            planName: plan.name,
            amount: plan.priceInr,
          } as any,
        },
      });

      return sub;
    });

    // 5. Invalidate Redis cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${userId}`);
      await redis.del(`sub:balance:${userId}`);
    } catch {
      // Redis unavailable — cache will expire naturally
    }

    logger.info(
      {
        userId,
        subscriptionId: subscription.id,
        planName: plan.name,
        razorpay_payment_id,
      },
      "Razorpay subscription activated"
    );

    // 6. Audit log
    try {
      const { auditService } = await import("../audit.service.js");
      auditService.logSubscriptionAction(userId, "INITIAL_BUY", subscription.id, {
        provider: "RAZORPAY",
        planName: plan.name,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });
    } catch {
      // Non-critical
    }

    return subscriptionService.getActiveSubscription(userId);
  }

  /**
   * Verify Razorpay webhook signature.
   *
   * @param body - Raw request body (string)
   * @param signature - x-razorpay-signature header
   * @returns true if signature matches
   */
  async verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
    const webhookSecret = await credentialService.getCredentialOrEnv("razorpay_webhook_secret");
    if (!webhookSecret) return false;

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    return expectedSignature === signature;
  }
}

export const razorpayService = new RazorpayService();
