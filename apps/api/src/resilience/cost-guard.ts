import { getRedis } from "../config/redis.js";
import { prisma } from "../config/database.js";
import { COST_GUARDRAILS } from "@ep/shared";
import { logger } from "../utils/logger.js";
import type { QualityTier } from "@ep/shared";

/**
 * Load cost guardrail thresholds from SystemConfig (DB).
 * Falls back to shared constants if DB values not set.
 */
async function loadThresholds(): Promise<{
  warning: number;
  critical: number;
  emergency: number;
}> {
  try {
    const keys = [
      "cost_warning_threshold_percent",
      "cost_critical_threshold_percent",
      "cost_emergency_threshold_percent",
    ];
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map(configs.map((c) => [c.key, c.value]));

    return {
      warning: parseConfigNumber(map.get("cost_warning_threshold_percent"), COST_GUARDRAILS.WARNING_THRESHOLD_PERCENT),
      critical: parseConfigNumber(map.get("cost_critical_threshold_percent"), COST_GUARDRAILS.CRITICAL_THRESHOLD_PERCENT),
      emergency: parseConfigNumber(map.get("cost_emergency_threshold_percent"), COST_GUARDRAILS.EMERGENCY_THRESHOLD_PERCENT),
    };
  } catch {
    return {
      warning: COST_GUARDRAILS.WARNING_THRESHOLD_PERCENT,
      critical: COST_GUARDRAILS.CRITICAL_THRESHOLD_PERCENT,
      emergency: COST_GUARDRAILS.EMERGENCY_THRESHOLD_PERCENT,
    };
  }
}

function parseConfigNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Cost Guard Service
 *
 * Tracks daily AI provider spend in Redis and enforces cost thresholds.
 *
 * Thresholds (configurable in SystemConfig):
 * - 70% of daily credit revenue → alert admin
 * - 90% → auto-disable PREMIUM tier
 * - 100% → disable STANDARD + PREMIUM, only BASIC remains
 *
 * The daily spend key resets at midnight UTC automatically (TTL).
 */

const DAILY_COST_KEY_PREFIX = "cost:daily:";
const DAILY_REVENUE_KEY_PREFIX = "revenue:daily:";

function getTodayKey(prefix: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${prefix}${today}`;
}

/**
 * Record an AI provider cost.
 * Called after each successful AI generation.
 */
export async function recordProviderCost(costCents: number): Promise<void> {
  try {
    const redis = getRedis();
    const key = getTodayKey(DAILY_COST_KEY_PREFIX);
    await redis.incrbyfloat(key, costCents);
    // Set TTL to 48 hours (auto-cleanup)
    await redis.expire(key, 48 * 3600);
  } catch (err) {
    logger.warn({ err }, "Failed to record provider cost in Redis");
  }
}

/**
 * Record credit revenue (credits spent on generations today).
 * Called when credits are debited for a generation.
 */
export async function recordCreditRevenue(credits: number): Promise<void> {
  try {
    const redis = getRedis();
    const key = getTodayKey(DAILY_REVENUE_KEY_PREFIX);
    await redis.incrby(key, credits);
    await redis.expire(key, 48 * 3600);
  } catch (err) {
    logger.warn({ err }, "Failed to record credit revenue in Redis");
  }
}

/**
 * Get today's cost and revenue metrics.
 */
export async function getDailyCostMetrics(): Promise<{
  costCents: number;
  revenueCredits: number;
  costRevenueRatio: number;
  thresholdPercent: number;
}> {
  try {
    const redis = getRedis();
    const [costStr, revenueStr] = await Promise.all([
      redis.get(getTodayKey(DAILY_COST_KEY_PREFIX)),
      redis.get(getTodayKey(DAILY_REVENUE_KEY_PREFIX)),
    ]);

    const costCents = parseFloat(costStr ?? "0");
    const revenueCredits = parseInt(revenueStr ?? "0", 10);

    // Get daily budget from SystemConfig (or use default)
    const budgetConfig = await prisma.systemConfig.findUnique({
      where: { key: "daily_ai_budget_cents" },
    });
    const dailyBudgetCents = budgetConfig
      ? Number((budgetConfig.value as any) ?? 10000)
      : 10000; // Default $100/day

    const thresholdPercent = dailyBudgetCents > 0
      ? (costCents / dailyBudgetCents) * 100
      : 0;

    return {
      costCents,
      revenueCredits,
      costRevenueRatio: revenueCredits > 0 ? costCents / revenueCredits : 0,
      thresholdPercent,
    };
  } catch (err) {
    logger.warn({ err }, "Failed to get daily cost metrics");
    return { costCents: 0, revenueCredits: 0, costRevenueRatio: 0, thresholdPercent: 0 };
  }
}

/**
 * Check if a tier is allowed based on current cost thresholds.
 *
 * All tiers are now AI-powered. Graduated blocking:
 * - 70%: warn (no blocking)
 * - 90%: block PREMIUM only
 * - 100%: block PREMIUM + STANDARD (BASIC falls back to overlay in pipeline)
 *
 * Returns true if the tier can proceed, false if cost guardrails block it.
 */
export async function isTierAllowedByCostGuard(tier: QualityTier): Promise<boolean> {
  try {
    const [metrics, thresholds] = await Promise.all([
      getDailyCostMetrics(),
      loadThresholds(),
    ]);

    if (metrics.thresholdPercent >= thresholds.emergency) {
      if (tier === "PREMIUM" || tier === "STANDARD") {
        logger.warn(
          { thresholdPercent: metrics.thresholdPercent, tier },
          "Cost guard: EMERGENCY — blocking AI tier"
        );
        return false;
      }
      logger.warn(
        { thresholdPercent: metrics.thresholdPercent },
        "Cost guard: EMERGENCY — BASIC will use overlay fallback"
      );
      return false;
    }

    if (metrics.thresholdPercent >= thresholds.critical && tier === "PREMIUM") {
      logger.warn(
        { thresholdPercent: metrics.thresholdPercent },
        "Cost guard: CRITICAL — blocking PREMIUM tier"
      );
      return false;
    }

    if (metrics.thresholdPercent >= thresholds.warning) {
      logger.info(
        { thresholdPercent: metrics.thresholdPercent },
        "Cost guard: WARNING — approaching daily spend limit"
      );
    }

    return true;
  } catch (err) {
    logger.warn({ err }, "Cost guard check failed — allowing tier as failsafe");
    return true;
  }
}
