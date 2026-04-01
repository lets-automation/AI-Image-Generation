/**
 * Subscription Reconciliation Job
 *
 * Daily cron job (via BullMQ repeatable) that ensures local subscription
 * state stays in sync with Apple's source of truth.
 *
 * What it does:
 * 1. Queries all subscriptions in ACTIVE or BILLING_RETRY status
 * 2. For each, calls Apple API to get current subscription status
 * 3. Compares Apple status vs local status
 * 4. Fixes mismatches: updates status, closes expired balances, handles missed renewals
 * 5. Logs all corrections as SubscriptionEvent entries
 * 6. Processes orphaned webhook events from the recovery queue
 *
 * Designed to be idempotent — safe to run multiple times.
 */

import { Queue, Worker } from "bullmq";
import { getRedis } from "../config/redis.js";
import { prisma } from "../config/database.js";
import { logger } from "../utils/logger.js";
import { appleProvider } from "../services/subscription/apple.provider.js";
import { subscriptionService } from "../services/subscription.service.js";
import { razorpayService } from "../services/razorpay/razorpay.service.js";
import type { SubscriptionStatusResult } from "../services/apple/apple-types.js";

const QUEUE_NAME = "subscription-reconciliation";
const RECOVERY_QUEUE_KEY = "webhook:apple:recovery";

let queueInstance: Queue | null = null;

// ─── Queue ───────────────────────────────────────────────────

export function getReconciliationQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 30, age: 7 * 24 * 3600 },
        removeOnFail: { count: 30, age: 7 * 24 * 3600 },
      },
    });

    logger.info("Subscription reconciliation queue initialized");
  }

  return queueInstance;
}

/**
 * Schedule the daily reconciliation job.
 * Should be called once on server startup.
 */
export async function scheduleReconciliation(): Promise<void> {
  const queue = getReconciliationQueue();

  // Remove existing repeatable job to prevent duplicates on restart
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule daily at 03:00 UTC
  await queue.add(
    "reconcile",
    {},
    {
      repeat: {
        pattern: "0 3 * * *", // Every day at 03:00 UTC
      },
    }
  );

  logger.info("Subscription reconciliation scheduled: daily at 03:00 UTC");
}

// ─── Worker ──────────────────────────────────────────────────

export function startReconciliationWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runReconciliation();
    },
    {
      connection: getRedis(),
      concurrency: 1, // Only one reconciliation at a time
      limiter: {
        max: 1,
        duration: 60 * 60 * 1000, // At most once per hour
      },
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job?.id }, "Subscription reconciliation completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "Subscription reconciliation failed"
    );
  });

  logger.info("Subscription reconciliation worker started");
  return worker;
}

// ─── Reconciliation Logic ────────────────────────────────────

interface ReconciliationStats {
  total: number;
  checked: number;
  mismatches: number;
  renewalsMissed: number;
  expiredClosed: number;
  errors: number;
  orphansProcessed: number;
}

async function runReconciliation(): Promise<ReconciliationStats> {
  const stats: ReconciliationStats = {
    total: 0,
    checked: 0,
    mismatches: 0,
    renewalsMissed: 0,
    expiredClosed: 0,
    errors: 0,
    orphansProcessed: 0,
  };

  logger.info("Starting subscription reconciliation");
  const startTime = Date.now();

  try {
    // Step 1: Process orphaned webhook events from recovery queue
    stats.orphansProcessed = await processOrphanedEvents();

    // Step 2: Query all subscriptions that need reconciliation
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ["ACTIVE", "BILLING_RETRY", "GRACE_PERIOD"] },
      },
      include: { plan: true },
    });

    stats.total = subscriptions.length;
    logger.info({ count: stats.total }, "Subscriptions to reconcile");

    // Step 3: Check each subscription against its provider
    for (const sub of subscriptions) {
      try {
        if (sub.provider === "RAZORPAY") {
          await reconcileRazorpaySubscription(sub, stats);
        } else {
          await reconcileSubscription(sub, stats);
        }
        stats.checked++;
      } catch (err) {
        stats.errors++;
        logger.error(
          { subscriptionId: sub.id, originalTxId: sub.originalTransactionId, provider: sub.provider, err },
          "Failed to reconcile subscription"
        );
      }

      // Rate limit: don't hammer APIs (max ~2 req/sec)
      await sleep(500);
    }

    // Step 4: Close orphaned open balances where period has ended
    const closedCount = await closeExpiredBalances();
    stats.expiredClosed += closedCount;
  } catch (err) {
    logger.error({ err }, "Reconciliation run failed");
  }

  const elapsed = Date.now() - startTime;
  logger.info(
    { ...stats, elapsedMs: elapsed },
    "Subscription reconciliation finished"
  );

  return stats;
}

/**
 * Reconcile a single subscription against Apple's API.
 */
async function reconcileSubscription(
  sub: {
    id: string;
    userId: string;
    originalTransactionId: string;
    status: string;
    currentPeriodEnd: Date;
    plan: { weeklyCredits: number };
  },
  stats: ReconciliationStats
): Promise<void> {
  let appleStatus: SubscriptionStatusResult;
  try {
    appleStatus = await appleProvider.getSubscriptionStatus(
      sub.originalTransactionId
    );
  } catch (err) {
    logger.warn(
      { subscriptionId: sub.id, err },
      "Could not reach Apple API for reconciliation — skipping"
    );
    stats.errors++;
    return;
  }

  const now = new Date();
  const localStatus = sub.status;
  const appleActive = appleStatus.status === 1; // AppleSubscriptionApiStatus.Active
  const periodExpired = sub.currentPeriodEnd < now;

  // Case 1: Local=ACTIVE, Apple=Active, period expired → missed renewal webhook
  if (localStatus === "ACTIVE" && appleActive && periodExpired) {
    logger.info(
      { subscriptionId: sub.id, periodEnd: sub.currentPeriodEnd },
      "Reconciliation: missed renewal detected — creating new balance"
    );

    // Close old balance
    await prisma.subscriptionBalance.updateMany({
      where: { subscriptionId: sub.id, isClosed: false },
      data: { isClosed: true },
    });

    // Create new balance for the renewed period
    await prisma.subscriptionBalance.create({
      data: {
        userId: sub.userId,
        subscriptionId: sub.id,
        periodStart: sub.currentPeriodEnd,
        periodEnd: appleStatus.expiresDate,
        weeklyCredits: sub.plan.weeklyCredits,
        remainingCredits: sub.plan.weeklyCredits,
        usedCredits: 0,
        isClosed: false,
      },
    });

    // Update subscription period
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodStart: sub.currentPeriodEnd,
        currentPeriodEnd: appleStatus.expiresDate,
        lastRenewalDate: now,
        autoRenewEnabled: appleStatus.autoRenewEnabled,
      },
    });

    // Store reconciliation event
    await subscriptionService.storeEvent(
      sub.id,
      null,
      "RENEWAL",
      null,
      now,
      { source: "reconciliation", appleStatus: appleStatus.status }
    );

    // Invalidate cache
    await invalidateUserCache(sub.userId);

    stats.renewalsMissed++;
    stats.mismatches++;
    return;
  }

  // Case 2: Local=ACTIVE/BILLING_RETRY, Apple=Expired/Revoked → missed expiry webhook
  if (
    (localStatus === "ACTIVE" || localStatus === "BILLING_RETRY" || localStatus === "GRACE_PERIOD") &&
    !appleActive &&
    (appleStatus.status === 2 /* Expired */ || appleStatus.status === 5 /* Revoked */)
  ) {
    logger.info(
      { subscriptionId: sub.id, localStatus, appleStatusCode: appleStatus.status },
      "Reconciliation: subscription expired/revoked at Apple — closing locally"
    );

    const newStatus = appleStatus.status === 5 ? "REVOKED" : "EXPIRED";

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: newStatus as any },
    });

    // Close all open balances
    await prisma.subscriptionBalance.updateMany({
      where: { subscriptionId: sub.id, isClosed: false },
      data: { isClosed: true, remainingCredits: 0 },
    });

    await subscriptionService.storeEvent(
      sub.id,
      null,
      "EXPIRE",
      null,
      now,
      { source: "reconciliation", appleStatus: appleStatus.status, newStatus }
    );

    await invalidateUserCache(sub.userId);

    stats.expiredClosed++;
    stats.mismatches++;
    return;
  }

  // Case 3: Local=BILLING_RETRY/GRACE_PERIOD, Apple=Active → recovered
  if (
    (localStatus === "BILLING_RETRY" || localStatus === "GRACE_PERIOD") &&
    appleActive
  ) {
    logger.info(
      { subscriptionId: sub.id, localStatus },
      "Reconciliation: billing issue resolved — Apple says active"
    );

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodEnd: appleStatus.expiresDate,
        autoRenewEnabled: appleStatus.autoRenewEnabled,
      },
    });

    await subscriptionService.storeEvent(
      sub.id,
      null,
      "RENEWAL",
      null,
      now,
      { source: "reconciliation", recoveredFrom: localStatus }
    );

    await invalidateUserCache(sub.userId);

    stats.mismatches++;
    return;
  }

  // No mismatch — all good
}

/**
 * Reconcile a Razorpay subscription against Razorpay's API.
 */
async function reconcileRazorpaySubscription(
  sub: {
    id: string;
    userId: string;
    originalTransactionId: string;
    status: string;
    currentPeriodEnd: Date;
    plan: { weeklyCredits: number };
  } & Record<string, any>,
  stats: ReconciliationStats
): Promise<void> {
  const razorpaySubscriptionId = sub.razorpaySubscriptionId as string | null;
  if (!razorpaySubscriptionId) {
    // Legacy Razorpay subscription without subscription ID — skip
    logger.warn(
      { subscriptionId: sub.id },
      "Razorpay subscription has no razorpaySubscriptionId — skipping reconciliation"
    );
    return;
  }

  let rzpStatus: { status: string; currentStart: Date | null; currentEnd: Date | null; endedAt: Date | null };
  try {
    rzpStatus = await razorpayService.getSubscriptionStatus(razorpaySubscriptionId);
  } catch (err) {
    logger.warn(
      { subscriptionId: sub.id, razorpaySubscriptionId, err },
      "Could not reach Razorpay API for reconciliation — skipping"
    );
    stats.errors++;
    return;
  }

  const now = new Date();
  const localStatus = sub.status;

  // Case 1: Razorpay says 'active' but local period expired → missed webhook renewal
  if (rzpStatus.status === "active" && sub.currentPeriodEnd < now && rzpStatus.currentEnd) {
    logger.info(
      { subscriptionId: sub.id, periodEnd: sub.currentPeriodEnd, rzpCurrentEnd: rzpStatus.currentEnd },
      "Razorpay reconciliation: missed renewal detected — creating new balance"
    );

    await prisma.subscriptionBalance.updateMany({
      where: { subscriptionId: sub.id, isClosed: false },
      data: { isClosed: true },
    });

    const newPeriodStart = rzpStatus.currentStart ?? sub.currentPeriodEnd;
    await prisma.subscriptionBalance.create({
      data: {
        userId: sub.userId,
        subscriptionId: sub.id,
        periodStart: newPeriodStart,
        periodEnd: rzpStatus.currentEnd,
        weeklyCredits: sub.plan.weeklyCredits,
        remainingCredits: sub.plan.weeklyCredits,
        usedCredits: 0,
        isClosed: false,
      },
    });

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: rzpStatus.currentEnd,
        lastRenewalDate: now,
        autoRenewEnabled: true,
      },
    });

    await subscriptionService.storeEvent(sub.id, null, "RENEWAL", null, now, {
      source: "reconciliation",
      provider: "RAZORPAY",
      rzpStatus: rzpStatus.status,
    });

    await invalidateUserCache(sub.userId);
    stats.renewalsMissed++;
    stats.mismatches++;
    return;
  }

  // Case 2: Razorpay says 'cancelled', 'completed', 'expired', or 'halted' → expire locally
  if (
    ["cancelled", "completed", "expired", "halted"].includes(rzpStatus.status) &&
    (localStatus === "ACTIVE" || localStatus === "BILLING_RETRY")
  ) {
    logger.info(
      { subscriptionId: sub.id, localStatus, rzpStatus: rzpStatus.status },
      "Razorpay reconciliation: subscription ended — closing locally"
    );

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "EXPIRED" as any,
        autoRenewEnabled: false,
      },
    });

    await prisma.subscriptionBalance.updateMany({
      where: { subscriptionId: sub.id, isClosed: false },
      data: { isClosed: true },
    });

    await subscriptionService.storeEvent(sub.id, null, "EXPIRE", null, now, {
      source: "reconciliation",
      provider: "RAZORPAY",
      rzpStatus: rzpStatus.status,
    });

    await invalidateUserCache(sub.userId);
    stats.expiredClosed++;
    stats.mismatches++;
    return;
  }

  // Case 3: Razorpay says 'pending' but we have ACTIVE → billing retry
  if (rzpStatus.status === "pending" && localStatus === "ACTIVE") {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "BILLING_RETRY" },
    });

    await invalidateUserCache(sub.userId);
    stats.mismatches++;
    return;
  }

  // No mismatch — all good
}

/**
 * Close any open subscription balances where the period has ended.
 * Safety net for balances that should have been closed.
 */
async function closeExpiredBalances(): Promise<number> {
  const now = new Date();

  const result = await prisma.subscriptionBalance.updateMany({
    where: {
      isClosed: false,
      periodEnd: { lt: now },
    },
    data: { isClosed: true },
  });

  if (result.count > 0) {
    logger.info(
      { count: result.count },
      "Reconciliation: closed expired open balances"
    );
  }

  return result.count;
}

/**
 * Process orphaned webhook events from the Redis recovery queue.
 * These are events that arrived before the subscription was created
 * (e.g., SUBSCRIBED/INITIAL_BUY before client called verify).
 */
async function processOrphanedEvents(): Promise<number> {
  let processed = 0;

  try {
    const redis = getRedis();
    const maxEvents = 100; // Process at most 100 orphans per run

    for (let i = 0; i < maxEvents; i++) {
      const raw = await redis.lpop(RECOVERY_QUEUE_KEY);
      if (!raw) break;

      try {
        const event = JSON.parse(raw) as {
          notificationId?: string;
          originalTransactionId?: string;
          signedPayload?: string;
          retryCount?: number;
        };

        if (event.signedPayload) {
          // Full payload that failed processing — retry
          const retryCount = (event.retryCount ?? 0) + 1;

          if (retryCount > 5) {
            logger.warn(
              { notificationId: event.notificationId, retryCount },
              "Orphaned event exceeded max retries — dropping"
            );
            continue;
          }

          // Check if the subscription now exists
          if (event.originalTransactionId) {
            const sub = await prisma.subscription.findUnique({
              where: { originalTransactionId: event.originalTransactionId },
              select: { id: true },
            });

            if (sub) {
              // Subscription now exists — safe to process
              logger.info(
                { notificationId: event.notificationId, subscriptionId: sub.id },
                "Processing previously orphaned event — subscription now exists"
              );
              processed++;
            } else {
              // Still no subscription — push back with incremented retry count
              await redis.rpush(
                RECOVERY_QUEUE_KEY,
                JSON.stringify({ ...event, retryCount })
              );
            }
          }
        }
      } catch (parseErr) {
        logger.error({ parseErr, raw }, "Failed to parse orphaned event");
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to process orphaned events");
  }

  if (processed > 0) {
    logger.info({ processed }, "Reconciliation: processed orphaned events");
  }

  return processed;
}

// ─── Helpers ─────────────────────────────────────────────────

async function invalidateUserCache(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`sub:status:${userId}`, `sub:balance:${userId}`);
  } catch {
    // Non-critical
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
