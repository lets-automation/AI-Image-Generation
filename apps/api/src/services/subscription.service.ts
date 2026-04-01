/**
 * Subscription Service — State Machine + Credit Operations
 *
 * Central service for managing Apple Auto-Renewable Subscriptions.
 * Handles the full lifecycle: activation, renewal, billing retry,
 * grace period, expiry, refund, cancel, upgrade, downgrade.
 *
 * Critical invariants:
 * - Credits ONLY reset on confirmed DID_RENEW (not cron)
 * - Grace period / billing retry NEVER create new balances
 * - REFUND = hard revoke (zero credits, close balance, block immediately)
 * - Upgrade = immediate (new balance), Downgrade = deferred (pendingPlanId)
 * - Single active balance invariant: close old before creating new
 * - Server is source of truth — client never credits/resets balance
 *
 * Handles Apple Auto-Renewable Subscriptions end-to-end.
 */

import { Prisma } from "@prisma/client";
import type { QualityTier, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/database.js";
import { getRedis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  InsufficientCreditsError,
  SubscriptionRequiredError,
  TierNotAllowedError,
} from "../utils/errors.js";
import { auditService } from "./audit.service.js";
import { appleProvider } from "./subscription/apple.provider.js";
import type { VerifiedTransaction } from "./apple/apple-types.js";

// ─── Redis Cache Keys & TTLs ────────────────────────────────

const CACHE_PREFIX = "sub";
const STATUS_TTL = 60;   // 60 seconds

function statusKey(userId: string): string {
  return `${CACHE_PREFIX}:status:${userId}`;
}

function balanceKey(userId: string): string {
  return `${CACHE_PREFIX}:balance:${userId}`;
}

// ─── Types ─────────────────────────────────────────────────

import type { Subscription, SubscriptionPlan } from "@prisma/client";

type ActiveSubscriptionResult = {
  subscription: Subscription & { plan: SubscriptionPlan };
  balance: { remainingCredits: number; weeklyCredits: number; periodEnd: Date } | null;
} | null;

// ─── Subscription Service ───────────────────────────────────

export class SubscriptionService {

  // ─── Activation (INITIAL_BUY) ─────────────────────────────

  /**
   * Activate a new subscription after initial purchase.
   * Creates Subscription + first SubscriptionBalance.
   *
   * State: → ACTIVE (new balance created)
   */
  async activateSubscription(
    userId: string,
    verifiedTx: VerifiedTransaction
  ) {
    // Look up the SubscriptionPlan by Apple product ID
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { appleProductId: verifiedTx.productId, isActive: true },
    });
    if (!plan) {
      throw new NotFoundError(`Subscription plan for product ${verifiedTx.productId}`);
    }

    // Check if this originalTransactionId already exists (idempotency)
    const existing = await prisma.subscription.findUnique({
      where: { originalTransactionId: verifiedTx.originalTransactionId },
    });
    if (existing) {
      // If same user, just return existing — idempotent
      if (existing.userId === userId) {
        logger.info(
          { subscriptionId: existing.id, userId },
          "Subscription already exists for this transaction — idempotent"
        );
        return existing;
      }
      // Different user trying to claim same transaction — reject
      throw new ConflictError(
        "This subscription is already linked to another account"
      );
    }

    const subscription = await prisma.$transaction(async (tx) => {
      // Create the subscription
      const sub = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          provider: "APPLE",
          originalTransactionId: verifiedTx.originalTransactionId,
          latestTransactionId: verifiedTx.transactionId,
          status: "ACTIVE",
          currentPeriodStart: verifiedTx.purchaseDate,
          currentPeriodEnd: verifiedTx.expiresDate,
          autoRenewEnabled: true,
          lastRenewalDate: verifiedTx.purchaseDate,
          environment: verifiedTx.environment,
        },
      });

      // Create the first balance for this period
      await tx.subscriptionBalance.create({
        data: {
          userId,
          subscriptionId: sub.id,
          periodStart: verifiedTx.purchaseDate,
          periodEnd: verifiedTx.expiresDate,
          weeklyCredits: plan.weeklyCredits,
          remainingCredits: plan.weeklyCredits,
          usedCredits: 0,
          isClosed: false,
        },
      });

      // Record activation event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          eventType: "INITIAL_BUY",
          transactionId: verifiedTx.transactionId,
          effectiveDate: verifiedTx.purchaseDate,
        },
      });

      return sub;
    });

    // Invalidate cache
    await this.invalidateCache(userId);

    // Audit log (fire-and-forget)
    auditService.logSubscriptionAction(userId, "activate", subscription.id, {
      planId: plan.id,
      planName: plan.name,
      weeklyCredits: plan.weeklyCredits,
      originalTransactionId: verifiedTx.originalTransactionId,
    });

    logger.info(
      { subscriptionId: subscription.id, userId, planName: plan.name },
      "Subscription activated"
    );

    return subscription;
  }

  // ─── Renewal (DID_RENEW) ──────────────────────────────────

  /**
   * Handle subscription renewal.
   * Close old balance, create new balance with fresh credits.
   *
   * State: ACTIVE/BILLING_RETRY/GRACE_PERIOD + DID_RENEW → ACTIVE
   */
  async handleRenewal(
    originalTransactionId: string,
    renewalTx: VerifiedTransaction
  ) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    // If there's a pending downgrade, apply it now
    let planId = subscription.planId;
    let plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundError("Subscription plan");

    if (subscription.pendingPlanId) {
      const pendingPlan = await prisma.subscriptionPlan.findUnique({
        where: { id: subscription.pendingPlanId },
      });
      if (pendingPlan) {
        planId = pendingPlan.id;
        plan = pendingPlan;
        logger.info(
          { subscriptionId: subscription.id, oldPlanId: subscription.planId, newPlanId: planId },
          "Applying pending downgrade on renewal"
        );
      }
    }

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
          periodStart: renewalTx.purchaseDate,
          periodEnd: renewalTx.expiresDate,
          weeklyCredits: plan!.weeklyCredits,
          remainingCredits: plan!.weeklyCredits,
          usedCredits: 0,
          isClosed: false,
        },
      });

      // Update subscription
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          planId,
          currentPeriodStart: renewalTx.purchaseDate,
          currentPeriodEnd: renewalTx.expiresDate,
          latestTransactionId: renewalTx.transactionId,
          lastRenewalDate: renewalTx.purchaseDate,
          autoRenewEnabled: true,
          pendingPlanId: null, // Clear pending downgrade
        },
      });

      // Record renewal event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "RENEWAL",
          transactionId: renewalTx.transactionId,
          effectiveDate: renewalTx.purchaseDate,
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    auditService.logSubscriptionAction(
      subscription.userId,
      "renewal",
      subscription.id,
      { transactionId: renewalTx.transactionId, planId, weeklyCredits: plan.weeklyCredits }
    );

    logger.info(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Subscription renewed"
    );
  }

  // ─── Billing Retry (DID_FAIL_TO_RENEW) ───────────────────

  /**
   * Handle billing retry — Apple failed to charge.
   * Keep current balance, do NOT reset credits.
   *
   * State: ACTIVE + DID_FAIL_TO_RENEW → BILLING_RETRY
   */
  async handleBillingRetry(originalTransactionId: string) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

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
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    logger.warn(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Subscription entered billing retry"
    );
  }

  // ─── Grace Period ─────────────────────────────────────────

  /**
   * Handle grace period entry.
   * Keep current balance, do NOT reset credits.
   *
   * State: BILLING_RETRY + GRACE_PERIOD → GRACE_PERIOD
   */
  async handleGracePeriod(originalTransactionId: string) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "GRACE_PERIOD" },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "GRACE_PERIOD_START",
          effectiveDate: new Date(),
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    logger.warn(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Subscription entered grace period"
    );
  }

  // ─── Expire ───────────────────────────────────────────────

  /**
   * Handle subscription expiry.
   * Close balance, NO new balance.
   *
   * State: GRACE_PERIOD/ACTIVE + EXPIRE → EXPIRED
   */
  async handleExpire(originalTransactionId: string) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

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
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    logger.info(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Subscription expired"
    );
  }

  // ─── Refund / Revoke ──────────────────────────────────────

  /**
   * Handle refund or revocation.
   * Zero remaining credits, close balance, block immediately.
   *
   * State: ANY + REFUND → REVOKED
   */
  async handleRefund(originalTransactionId: string) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    await prisma.$transaction(async (tx) => {
      // Zero out and close all open balances
      await tx.subscriptionBalance.updateMany({
        where: { subscriptionId: subscription.id, isClosed: false },
        data: { remainingCredits: 0, isClosed: true },
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "REVOKED" },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "REVOKE",
          effectiveDate: new Date(),
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    auditService.logSubscriptionAction(
      subscription.userId,
      "refund",
      subscription.id,
      { originalTransactionId }
    );

    logger.warn(
      { subscriptionId: subscription.id, userId: subscription.userId },
      "Subscription revoked (refund)"
    );
  }

  // ─── Cancel (auto-renew disabled) ─────────────────────────

  /**
   * Handle cancellation — user turned off auto-renew.
   * Keep access until periodEnd.
   *
   * State: ACTIVE + CANCEL → ACTIVE (autoRenewEnabled=false)
   */
  async handleCancel(originalTransactionId: string, reason?: string) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          autoRenewEnabled: false,
          cancellationReason: reason ?? null,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "CANCEL",
          effectiveDate: new Date(),
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    logger.info(
      { subscriptionId: subscription.id, userId: subscription.userId, reason },
      "Subscription auto-renew disabled (cancelled)"
    );
  }

  // ─── Upgrade (immediate) ──────────────────────────────────

  /**
   * Handle upgrade — immediate in Apple.
   * Close current balance, create new balance with new plan credits.
   *
   * State: ACTIVE + UPGRADE → ACTIVE (new plan, new balance)
   */
  async handleUpgrade(
    originalTransactionId: string,
    upgradeTx: VerifiedTransaction
  ) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    const newPlan = await prisma.subscriptionPlan.findFirst({
      where: { appleProductId: upgradeTx.productId, isActive: true },
    });
    if (!newPlan) {
      throw new NotFoundError(`Subscription plan for product ${upgradeTx.productId}`);
    }

    await prisma.$transaction(async (tx) => {
      // Close old balance
      await tx.subscriptionBalance.updateMany({
        where: { subscriptionId: subscription.id, isClosed: false },
        data: { isClosed: true },
      });

      // Create new balance with new plan credits
      await tx.subscriptionBalance.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          periodStart: upgradeTx.purchaseDate,
          periodEnd: upgradeTx.expiresDate,
          weeklyCredits: newPlan.weeklyCredits,
          remainingCredits: newPlan.weeklyCredits,
          usedCredits: 0,
          isClosed: false,
        },
      });

      // Update subscription
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: newPlan.id,
          status: "ACTIVE",
          currentPeriodStart: upgradeTx.purchaseDate,
          currentPeriodEnd: upgradeTx.expiresDate,
          latestTransactionId: upgradeTx.transactionId,
          pendingPlanId: null,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "UPGRADE",
          transactionId: upgradeTx.transactionId,
          effectiveDate: upgradeTx.purchaseDate,
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    auditService.logSubscriptionAction(
      subscription.userId,
      "upgrade",
      subscription.id,
      { oldPlanId: subscription.planId, newPlanId: newPlan.id, newPlanName: newPlan.name }
    );

    logger.info(
      { subscriptionId: subscription.id, userId: subscription.userId, newPlan: newPlan.name },
      "Subscription upgraded"
    );
  }

  // ─── Downgrade (deferred) ─────────────────────────────────

  /**
   * Handle downgrade — deferred in Apple.
   * Store pending plan, apply at next DID_RENEW.
   *
   * State: ACTIVE + DOWNGRADE → ACTIVE (pendingPlanId set)
   */
  async handleDowngrade(
    originalTransactionId: string,
    newProductId: string
  ) {
    const subscription = await this.findSubscriptionByOriginalTxId(originalTransactionId);

    const newPlan = await prisma.subscriptionPlan.findFirst({
      where: { appleProductId: newProductId, isActive: true },
    });
    if (!newPlan) {
      throw new NotFoundError(`Subscription plan for product ${newProductId}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { pendingPlanId: newPlan.id },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: "DOWNGRADE",
          effectiveDate: new Date(),
        },
      });
    });

    await this.invalidateCache(subscription.userId);

    logger.info(
      { subscriptionId: subscription.id, pendingPlanId: newPlan.id },
      "Subscription downgrade scheduled for next renewal"
    );
  }

  // ─── Query: Get Active Subscription ───────────────────────

  /**
   * Get the active subscription and current balance for a user.
   * Uses Redis cache with 60s TTL for subscription status.
   */
  async getActiveSubscription(userId: string) {
    // Check Redis cache first
    try {
      const redis = getRedis();
      const cached = await redis.get(statusKey(userId));
      if (cached) {
        return JSON.parse(cached) as ActiveSubscriptionResult;
      }
    } catch {
      // Redis down — fall through to DB
    }

    const subscription = await this.findActiveSubscriptionFromDb(userId);
    if (!subscription) return null;

    const balance = await prisma.subscriptionBalance.findFirst({
      where: {
        subscriptionId: subscription.id,
        userId,
        isClosed: false,
      },
      select: {
        remainingCredits: true,
        weeklyCredits: true,
        periodEnd: true,
      },
    });

    const result = { subscription, balance };

    // Cache in Redis
    try {
      const redis = getRedis();
      await redis.setex(statusKey(userId), STATUS_TTL, JSON.stringify(result));
    } catch {
      // Non-critical
    }

    return result;
  }

  // ─── Cancel Subscription ──────────────────────────────────

  /**
   * Cancel auto-renewal on the user's active subscription.
   * The subscription stays active until currentPeriodEnd, then expires.
   *
   * Provider-aware:
   * - APPLE: Cannot cancel server-side. Throws error directing user to Apple Settings.
   * - RAZORPAY: Calls Razorpay API to cancel at cycle end, then updates local DB.
   */
  async cancelSubscription(userId: string) {
    const subscription = await this.findActiveSubscriptionFromDb(userId);
    if (!subscription) {
      throw new NotFoundError("Active subscription");
    }

    if (!subscription.autoRenewEnabled) {
      throw new ConflictError("Subscription is already set to cancel at period end");
    }

    // Provider-specific cancellation
    if (subscription.provider === "APPLE") {
      throw new BadRequestError(
        "Apple subscriptions cannot be cancelled from this app. " +
        "Please go to Settings → Apple ID → Subscriptions on your iPhone/iPad to manage your subscription."
      );
    }

    if (subscription.provider === "RAZORPAY") {
      // Import and use Razorpay service to cancel via API
      const { razorpayService } = await import("./razorpay/razorpay.service.js");
      await razorpayService.cancelSubscription(userId);
    } else {
      // Generic fallback — just update local DB
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { autoRenewEnabled: false },
      });
    }

    // Invalidate cache
    try {
      const redis = getRedis();
      await redis.del(statusKey(userId));
    } catch {
      // Non-critical
    }

    logger.info({ userId, subscriptionId: subscription.id, provider: subscription.provider }, "Subscription auto-renewal cancelled");

    return this.getActiveSubscription(userId);
  }

  // ─── Credit Operations ────────────────────────────────────

  /**
   * Check tier access for a user's subscription plan.
   * Throws TierNotAllowedError if the user's plan doesn't include the tier.
   */
  async checkTierAccess(userId: string, qualityTier: QualityTier) {
    const active = await this.getActiveSubscription(userId);
    if (!active?.subscription) {
      throw new SubscriptionRequiredError();
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: active.subscription.planId },
    });
    if (!plan) throw new NotFoundError("Subscription plan");

    if (!plan.tierAccess.includes(qualityTier)) {
      throw new TierNotAllowedError(qualityTier);
    }
  }

  /**
   * Atomic credit check + debit with serializable isolation.
   *
   * Steps:
   * 1. Find active balance (isClosed=false, periodEnd > now)
   * 2. If not found → soft-verify with Apple (missed webhook recovery)
   * 3. If remainingCredits < creditCost → throw InsufficientCreditsError
   * 4. Decrement remainingCredits, increment usedCredits
   *
   * Uses SELECT FOR UPDATE for explicit row locking.
   */
  async checkAndDebitCredit(
    userId: string,
    creditCost: number,
    _generationId: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        const now = new Date();

        // Step 1: Find open balance with row lock
        // Prisma doesn't support SELECT FOR UPDATE directly,
        // so we use raw query for the lock and then verify via Prisma
        const balanceRows = await tx.$queryRaw<
          Array<{
            id: string;
            remainingCredits: number;
            weeklyCredits: number;
            periodEnd: Date;
            subscriptionId: string;
          }>
        >`
          SELECT id, "remainingCredits", "weeklyCredits", "periodEnd", "subscriptionId"
          FROM subscription_balances
          WHERE "userId" = ${userId}
            AND "isClosed" = false
            AND "periodEnd" > ${now}
          ORDER BY "periodEnd" DESC
          LIMIT 1
          FOR UPDATE
        `;

        let balance: {
          id: string;
          remainingCredits: number;
          weeklyCredits: number;
          periodEnd: Date;
          subscriptionId: string;
        } | null = balanceRows[0] ?? null;

        // Step 2: If no active balance, attempt soft-verify with Apple
        if (!balance) {
          balance = await this.softVerifyAndRecover(tx, userId, now);
        }

        if (!balance) {
          throw new SubscriptionRequiredError();
        }

        // Step 3: Check sufficient credits
        if (balance.remainingCredits < creditCost) {
          throw new InsufficientCreditsError(balance.remainingCredits, creditCost);
        }

        // Step 4: Debit credits
        const updated = await tx.subscriptionBalance.update({
          where: { id: balance.id },
          data: {
            remainingCredits: { decrement: creditCost },
            usedCredits: { increment: creditCost },
          },
        });

        // Invalidate balance cache
        this.invalidateBalanceCache(userId).catch(() => {});

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      }
    );
  }

  /**
   * Refund credits on failed generation.
   * Returns credits to the current open balance.
   */
  async refundCredit(
    userId: string,
    creditCost: number,
    _generationId: string
  ) {
    const balance = await prisma.subscriptionBalance.findFirst({
      where: { userId, isClosed: false },
      orderBy: { periodEnd: "desc" },
    });

    if (!balance) {
      logger.warn(
        { userId, creditCost },
        "No open balance to refund credits to — credits lost"
      );
      return;
    }

    await prisma.subscriptionBalance.update({
      where: { id: balance.id },
      data: {
        remainingCredits: { increment: creditCost },
        usedCredits: { decrement: creditCost },
      },
    });

    await this.invalidateBalanceCache(userId);

    logger.info(
      { userId, creditCost, balanceId: balance.id },
      "Credits refunded for failed generation"
    );
  }

  // ─── Restore Subscription ─────────────────────────────────

  /**
   * Restore subscription after reinstall.
   * Re-verifies with Apple and syncs local state.
   *
   * Ownership check: if originalTransactionId belongs to a different
   * userId, reject (prevents subscription hijacking across accounts).
   */
  async restoreSubscription(userId: string, originalTransactionId: string) {
    // Check if subscription already exists locally
    const existing = await prisma.subscription.findUnique({
      where: { originalTransactionId },
      include: { plan: true },
    });

    if (existing) {
      // Ownership check
      if (existing.userId !== userId) {
        throw new ConflictError(
          "This subscription belongs to a different account"
        );
      }

      // Already exists for this user — verify with Apple and sync
      const appleStatus = await appleProvider.getSubscriptionStatus(
        originalTransactionId
      );

      // Map Apple status to our status
      const newStatus = this.mapAppleStatusToLocal(appleStatus.status);

      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: newStatus,
          currentPeriodEnd: appleStatus.expiresDate,
          autoRenewEnabled: appleStatus.autoRenewEnabled,
        },
      });

      await this.invalidateCache(userId);

      return this.getActiveSubscription(userId);
    }

    // No local subscription — verify with Apple and create
    const appleStatus = await appleProvider.getSubscriptionStatus(
      originalTransactionId
    );

    // Only restore if Apple says it's active
    if (appleStatus.status !== 1 /* Active */) {
      throw new SubscriptionRequiredError();
    }

    // Create the subscription via activation flow
    const verifiedTx: VerifiedTransaction = {
      transactionId: originalTransactionId,
      originalTransactionId,
      productId: appleStatus.productId,
      purchaseDate: new Date(),
      expiresDate: appleStatus.expiresDate,
      environment: appleStatus.environment,
      isUpgraded: false,
      revocationDate: null,
      type: "Auto-Renewable Subscription",
    };

    return this.activateSubscription(userId, verifiedTx);
  }

  // ─── Store Webhook Event ──────────────────────────────────

  /**
   * Store a subscription event with idempotency check.
   * Returns false if the event was already processed (duplicate notification).
   */
  async storeEvent(
    subscriptionId: string,
    notificationId: string | null,
    eventType: string,
    transactionId: string | null,
    effectiveDate: Date,
    payload?: Record<string, unknown>
  ): Promise<boolean> {
    // Idempotency check via notificationId
    if (notificationId) {
      const existing = await prisma.subscriptionEvent.findUnique({
        where: { notificationId },
      });
      if (existing) {
        logger.info(
          { notificationId, eventType },
          "Duplicate notification — skipping"
        );
        return false;
      }
    }

    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        notificationId,
        eventType: eventType as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        transactionId,
        effectiveDate,
        payload: (payload ?? null) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    });

    return true;
  }

  // ─── Private Helpers ──────────────────────────────────────

  /**
   * Find subscription by originalTransactionId or throw.
   */
  private async findSubscriptionByOriginalTxId(originalTransactionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { originalTransactionId },
    });
    if (!subscription) {
      throw new NotFoundError(`Subscription with transaction ${originalTransactionId}`);
    }
    return subscription;
  }

  /**
   * Find the active subscription from DB (no cache).
   * Considers ACTIVE, BILLING_RETRY, and GRACE_PERIOD as "active".
   */
  private async findActiveSubscriptionFromDb(userId: string) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "BILLING_RETRY", "GRACE_PERIOD"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Soft-verify with Apple when no active balance is found.
   *
   * Guard: Only call Apple if there's a subscription in a
   * recoverable state (ACTIVE, BILLING_RETRY, GRACE_PERIOD).
   * If EXPIRED or REVOKED, reject immediately.
   *
   * This handles the race condition where a user generates at
   * period boundary and the renewal webhook hasn't arrived yet.
   */
  private async softVerifyAndRecover(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date
  ) {
    // Find the most recent subscription for this user
    const subscription = await tx.subscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "BILLING_RETRY", "GRACE_PERIOD"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) return null;

    // Guard: only verify if period has ended (missed webhook scenario)
    if (subscription.currentPeriodEnd > now) {
      // Period hasn't ended, but balance is closed/missing — shouldn't happen
      logger.warn(
        { subscriptionId: subscription.id, userId },
        "No open balance but period hasn't ended — possible data inconsistency"
      );
      return null;
    }

    try {
      logger.info(
        { subscriptionId: subscription.id, userId },
        "Soft-verifying with Apple (possible missed webhook)"
      );

      const appleStatus = await appleProvider.getSubscriptionStatus(
        subscription.originalTransactionId
      );

      // Apple says active — renewal happened but we missed the webhook
      if (appleStatus.status === 1 /* Active */) {
        // Create the missing balance
        const balance = await tx.subscriptionBalance.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            periodStart: subscription.currentPeriodEnd, // New period starts where old ended
            periodEnd: appleStatus.expiresDate,
            weeklyCredits: subscription.plan.weeklyCredits,
            remainingCredits: subscription.plan.weeklyCredits,
            usedCredits: 0,
            isClosed: false,
          },
        });

        // Update subscription with new period
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: appleStatus.expiresDate,
            lastRenewalDate: new Date(),
            autoRenewEnabled: appleStatus.autoRenewEnabled,
          },
        });

        logger.info(
          { subscriptionId: subscription.id, userId, newPeriodEnd: appleStatus.expiresDate },
          "Recovered missed renewal via soft-verify"
        );

        return {
          id: balance.id,
          remainingCredits: balance.remainingCredits,
          weeklyCredits: balance.weeklyCredits,
          periodEnd: balance.periodEnd,
          subscriptionId: balance.subscriptionId,
        };
      }

      // Apple confirms expired or other non-active state
      return null;
    } catch (err) {
      logger.error(
        { err, subscriptionId: subscription.id, userId },
        "Soft-verify with Apple failed — rejecting credit check"
      );
      return null;
    }
  }

  /**
   * Map Apple's numeric subscription status to our SubscriptionStatus enum.
   */
  private mapAppleStatusToLocal(appleStatus: number): SubscriptionStatus {
    switch (appleStatus) {
      case 1: return "ACTIVE";
      case 2: return "EXPIRED";
      case 3: return "BILLING_RETRY";
      case 4: return "GRACE_PERIOD";
      case 5: return "REVOKED";
      default: return "EXPIRED";
    }
  }

  /**
   * Invalidate all cached data for a user.
   */
  private async invalidateCache(userId: string) {
    try {
      const redis = getRedis();
      await redis.del(statusKey(userId), balanceKey(userId));
    } catch {
      // Non-critical
    }
  }

  /**
   * Invalidate only the balance cache for a user.
   */
  private async invalidateBalanceCache(userId: string) {
    try {
      const redis = getRedis();
      await redis.del(balanceKey(userId));
    } catch {
      // Non-critical
    }
  }
}

export const subscriptionService = new SubscriptionService();
