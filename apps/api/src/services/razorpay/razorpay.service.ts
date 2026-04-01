/**
 * Razorpay Service — Subscription-based Recurring Payments
 *
 * Handles Razorpay recurring payment flow for web subscription purchases:
 * 1. Create Razorpay Subscription (recurring) linked to a Razorpay Plan
 * 2. Verify payment signature after checkout
 * 3. Activate subscription on successful verification
 * 4. Handle renewal via subscription.charged webhook
 * 5. Handle cancellation via Razorpay API
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { credentialService } from "../credential.service.js";
import { prisma } from "../../config/database.js";
import { logger } from "../../utils/logger.js";
import { BadRequestError, NotFoundError, ServiceUnavailableError, ConflictError } from "../../utils/errors.js";

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

interface CreateSubscriptionResult {
  subscriptionId: string;
  planId: string;
  planName: string;
  keyId: string;
}

interface VerifyPaymentInput {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// ─── Service ─────────────────────────────────────────────

export class RazorpayService {
  /**
   * Create a Razorpay Subscription (recurring) for a subscription plan purchase.
   *
   * @param userId - The authenticated user's ID
   * @param planId - The SubscriptionPlan ID from our database
   * @returns Subscription details for the Razorpay checkout on frontend
   */
  async createSubscription(userId: string, planId: string): Promise<CreateSubscriptionResult> {
    // 1. Look up the subscription plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundError("Subscription plan");
    }

    if (!plan.razorpayPlanId) {
      throw new BadRequestError(
        "This plan does not have a Razorpay Plan configured. Please contact support."
      );
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
        "You already have an active subscription. Wait for it to expire or cancel it first."
      );
    }

    // 3. Create Razorpay Subscription (recurring)
    const razorpay = await getRazorpay();
    const keyId = await credentialService.getCredentialOrEnv("razorpay_key_id");

    let rzpSubscription: any;
    try {
      rzpSubscription = await razorpay.subscriptions.create({
        plan_id: plan.razorpayPlanId,
        total_count: 52,          // Up to 52 weeks (1 year) of billing cycles
        customer_notify: 1,       // Let Razorpay handle email notifications
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
          razorpayPlanId: plan.razorpayPlanId,
          razorpayError: rzpError?.message || rzpError,
          statusCode: rzpError?.statusCode,
          errorDescription: rzpError?.error?.description,
        },
        "Razorpay subscription creation failed"
      );
      throw new ServiceUnavailableError(
        rzpError?.error?.description || "Payment service temporarily unavailable. Please try again."
      );
    }

    logger.info(
      { userId, planId: plan.id, rzpSubscriptionId: rzpSubscription.id },
      "Razorpay subscription created"
    );

    return {
      subscriptionId: rzpSubscription.id,
      planId: plan.id,
      planName: plan.name,
      keyId,
    };
  }

  /**
   * Verify Razorpay subscription payment signature and activate the subscription.
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
    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = payment;

    // 1. Verify signature (subscription verification uses subscription_id|payment_id)
    const keySecret = await credentialService.getCredentialOrEnv("razorpay_key_secret");
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      logger.warn(
        { userId, razorpay_subscription_id, razorpay_payment_id },
        "Razorpay subscription payment signature verification failed"
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
      const { subscriptionService } = await import("../subscription.service.js");
      return subscriptionService.getActiveSubscription(userId);
    }

    // 4. Fetch subscription details from Razorpay to get actual dates
    const razorpay = await getRazorpay();
    let rzpSubDetails: any;
    try {
      rzpSubDetails = await razorpay.subscriptions.fetch(razorpay_subscription_id);
    } catch (err: any) {
      logger.error(
        { err: err?.message, razorpay_subscription_id },
        "Failed to fetch Razorpay subscription details"
      );
      // Fallback to 7-day period if we can't fetch
      rzpSubDetails = null;
    }

    // 5. Activate subscription
    const now = new Date();
    // Use Razorpay's current_start/current_end if available, else default to 7 days
    const periodStart = rzpSubDetails?.current_start
      ? new Date(rzpSubDetails.current_start * 1000)
      : now;
    const periodEnd = rzpSubDetails?.current_end
      ? new Date(rzpSubDetails.current_end * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { config } = await import("../../config/index.js");

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
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          autoRenewEnabled: true,
          lastRenewalDate: now,
          razorpaySubscriptionId: razorpay_subscription_id,
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
          periodStart,
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
            subscriptionId: razorpay_subscription_id,
            paymentId: razorpay_payment_id,
            planName: plan.name,
            amount: plan.priceInr,
          } as any,
        },
      });

      return sub;
    });

    // 6. Invalidate Redis cache
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
        razorpay_subscription_id,
        razorpay_payment_id,
      },
      "Razorpay subscription activated"
    );

    // 7. Audit log
    try {
      const { auditService } = await import("../audit.service.js");
      auditService.logSubscriptionAction(userId, "INITIAL_BUY", subscription.id, {
        provider: "RAZORPAY",
        planName: plan.name,
        paymentId: razorpay_payment_id,
        subscriptionId: razorpay_subscription_id,
      });
    } catch {
      // Non-critical
    }

    const { subscriptionService } = await import("../subscription.service.js");
    return subscriptionService.getActiveSubscription(userId);
  }

  /**
   * Handle subscription.charged webhook — Razorpay auto-charged the user.
   * This is the RENEWAL event for Razorpay subscriptions.
   *
   * @param razorpaySubscriptionId - Razorpay subscription ID
   * @param paymentId - The new payment ID for this charge
   * @param payload - Raw webhook payload
   */
  async handleSubscriptionCharged(
    razorpaySubscriptionId: string,
    paymentId: string,
    _payload: any
  ) {
    // Find our subscription by Razorpay subscription ID
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId } as any,
      include: { plan: true },
    });

    if (!subscription) {
      logger.warn(
        { razorpaySubscriptionId, paymentId },
        "subscription.charged webhook — no local subscription found"
      );
      return;
    }

    // Skip if this is the initial payment (already handled by verify flow)
    if (subscription.latestTransactionId === paymentId) {
      logger.info(
        { razorpaySubscriptionId, paymentId },
        "subscription.charged — duplicate of initial payment, skipping"
      );
      return;
    }

    // Fetch updated subscription details from Razorpay for accurate dates
    const razorpay = await getRazorpay();
    let rzpSubDetails: any;
    try {
      rzpSubDetails = await razorpay.subscriptions.fetch(razorpaySubscriptionId);
    } catch (err: any) {
      logger.error(
        { err: err?.message, razorpaySubscriptionId },
        "Failed to fetch Razorpay subscription details during renewal"
      );
      rzpSubDetails = null;
    }

    const now = new Date();
    const newPeriodStart = rzpSubDetails?.current_start
      ? new Date(rzpSubDetails.current_start * 1000)
      : subscription.currentPeriodEnd;
    const newPeriodEnd = rzpSubDetails?.current_end
      ? new Date(rzpSubDetails.current_end * 1000)
      : new Date((newPeriodStart as Date).getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Close all open balances for this subscription
      await tx.subscriptionBalance.updateMany({
        where: { subscriptionId: subscription.id, isClosed: false },
        data: { isClosed: true },
      });

      // Create new balance with fresh credits
      await tx.subscriptionBalance.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
          weeklyCredits: subscription.plan.weeklyCredits,
          remainingCredits: subscription.plan.weeklyCredits,
          usedCredits: 0,
          isClosed: false,
        },
      });

      // Update subscription
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          latestTransactionId: paymentId,
          lastRenewalDate: now,
          autoRenewEnabled: true,
        },
      });

      // Record renewal event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "RENEWAL",
          transactionId: paymentId,
          effectiveDate: now,
          payload: {
            provider: "RAZORPAY",
            source: "webhook",
            razorpaySubscriptionId,
          } as any,
        },
      });
    });

    // Invalidate cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${subscription.userId}`);
      await redis.del(`sub:balance:${subscription.userId}`);
    } catch {
      // Non-critical
    }

    logger.info(
      {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        paymentId,
        newPeriodEnd,
      },
      "Razorpay subscription renewed (subscription.charged)"
    );
  }

  /**
   * Handle subscription.pending webhook — payment is pending/failed.
   * Sets subscription to BILLING_RETRY status.
   */
  async handleSubscriptionPending(razorpaySubscriptionId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId } as any,
    });

    if (!subscription) {
      logger.warn(
        { razorpaySubscriptionId },
        "subscription.pending webhook — no local subscription found"
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "BILLING_RETRY" },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "BILLING_RETRY_START",
          effectiveDate: new Date(),
          payload: {
            provider: "RAZORPAY",
            source: "webhook",
            razorpaySubscriptionId,
          } as any,
        },
      });
    });

    // Invalidate cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${subscription.userId}`);
    } catch {
      // Non-critical
    }

    logger.warn(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Razorpay subscription payment pending — billing retry"
    );
  }

  /**
   * Handle subscription.halted webhook — payment retries exhausted.
   * Expires the subscription.
   */
  async handleSubscriptionHalted(razorpaySubscriptionId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId } as any,
    });

    if (!subscription) {
      logger.warn(
        { razorpaySubscriptionId },
        "subscription.halted webhook — no local subscription found"
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Close all open balances
      await tx.subscriptionBalance.updateMany({
        where: { subscriptionId: subscription.id, isClosed: false },
        data: { isClosed: true },
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "EXPIRED" },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "EXPIRE",
          effectiveDate: new Date(),
          payload: {
            provider: "RAZORPAY",
            source: "webhook",
            reason: "payment_retries_exhausted",
            razorpaySubscriptionId,
          } as any,
        },
      });
    });

    // Invalidate cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${subscription.userId}`);
      await redis.del(`sub:balance:${subscription.userId}`);
    } catch {
      // Non-critical
    }

    logger.warn(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Razorpay subscription halted — expired"
    );
  }

  /**
   * Handle subscription.cancelled webhook from Razorpay.
   * Sets autoRenewEnabled=false, subscription remains active until period end.
   */
  async handleSubscriptionCancelled(razorpaySubscriptionId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId } as any,
    });

    if (!subscription) {
      logger.warn(
        { razorpaySubscriptionId },
        "subscription.cancelled webhook — no local subscription found"
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          autoRenewEnabled: false,
          cancellationReason: "User cancelled via Razorpay",
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "CANCEL",
          effectiveDate: new Date(),
          payload: {
            provider: "RAZORPAY",
            source: "webhook",
            razorpaySubscriptionId,
          } as any,
        },
      });
    });

    // Invalidate cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${subscription.userId}`);
    } catch {
      // Non-critical
    }

    logger.info(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Razorpay subscription cancelled"
    );
  }

  /**
   * Cancel a Razorpay subscription via API.
   * Uses cancel_at_cycle_end=true so user keeps access until period end.
   *
   * @param userId - The user requesting cancellation
   */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        provider: "RAZORPAY" as any,
        status: { in: ["ACTIVE", "BILLING_RETRY", "GRACE_PERIOD"] },
      },
    });

    if (!subscription) {
      throw new NotFoundError("Active Razorpay subscription");
    }

    if (!subscription.autoRenewEnabled) {
      throw new ConflictError("Subscription is already set to cancel at period end");
    }

    const razorpaySubscriptionId = (subscription as any).razorpaySubscriptionId;
    if (!razorpaySubscriptionId) {
      // Legacy subscription without Razorpay subscription ID — just update local DB
      logger.warn(
        { subscriptionId: subscription.id },
        "No Razorpay subscription ID found — updating local DB only"
      );
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { autoRenewEnabled: false, cancellationReason: "User requested cancellation" },
      });
    } else {
      // Cancel on Razorpay side (at cycle end so user keeps access)
      const razorpay = await getRazorpay();
      try {
        await razorpay.subscriptions.cancel(razorpaySubscriptionId, { cancel_at_cycle_end: true } as any);
        logger.info(
          { razorpaySubscriptionId, subscriptionId: subscription.id },
          "Razorpay subscription cancelled at cycle end"
        );
      } catch (err: any) {
        logger.error(
          { err: err?.message, razorpaySubscriptionId },
          "Failed to cancel Razorpay subscription via API"
        );
        throw new ServiceUnavailableError(
          "Failed to cancel subscription. Please try again or contact support."
        );
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          autoRenewEnabled: false,
          cancellationReason: "User requested cancellation",
        },
      });
    }

    // Invalidate cache
    try {
      const { getRedis } = await import("../../config/redis.js");
      const redis = getRedis();
      await redis.del(`sub:status:${userId}`);
    } catch {
      // Non-critical
    }

    logger.info({ userId, subscriptionId: subscription.id }, "Razorpay subscription auto-renewal cancelled");
  }

  /**
   * Fetch Razorpay subscription status for reconciliation.
   */
  async getSubscriptionStatus(razorpaySubscriptionId: string): Promise<{
    status: string;
    currentStart: Date | null;
    currentEnd: Date | null;
    endedAt: Date | null;
  }> {
    const razorpay = await getRazorpay();
    const rzpSub = await razorpay.subscriptions.fetch(razorpaySubscriptionId);

    return {
      status: rzpSub.status,
      currentStart: rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : null,
      currentEnd: rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : null,
      endedAt: rzpSub.ended_at ? new Date(rzpSub.ended_at * 1000) : null,
    };
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
