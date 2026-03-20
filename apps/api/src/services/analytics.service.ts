import { prisma } from "../config/database.js";
import { getRedis } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/**
 * Analytics Service
 *
 * Provides dashboard statistics, generation metrics,
 * revenue tracking, and cost monitoring for the admin panel.
 */

interface DashboardStats {
  totalUsers: number;
  generationsToday: number;
  generationsTotal: number;
  creditsUsedToday: number;
  creditsUsedTotal: number;
  activeTemplates: number;
  totalCategories: number;
  pendingJobs: number;
  activeSubscriptions: number;
}

interface GenerationStats {
  date: string;
  count: number;
  tier: string;
}

interface CostMetrics {
  dailySpend: number;
  warningThreshold: number;
  criticalThreshold: number;
  emergencyThreshold: number;
  tier2Enabled: boolean;
  tier3Enabled: boolean;
}

class AnalyticsService {
  /**
   * Get dashboard summary statistics.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      generationsToday,
      generationsTotal,
      creditsUsedToday,
      creditsUsedTotal,
      activeTemplates,
      totalCategories,
      pendingJobs,
      activeSubscriptions,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),

      prisma.generation.count({
        where: { createdAt: { gte: todayStart } },
      }),

      prisma.generation.count(),

      // Credits used today: sum of credit costs for completed generations today
      prisma.generation
        .aggregate({
          where: {
            createdAt: { gte: todayStart },
            status: "COMPLETED",
          },
          _sum: { creditCost: true },
        })
        .then((r) => r._sum.creditCost ?? 0),

      // Total credits used: sum of all completed generation credit costs
      prisma.generation
        .aggregate({
          where: { status: "COMPLETED" },
          _sum: { creditCost: true },
        })
        .then((r) => r._sum.creditCost ?? 0),

      prisma.template.count({
        where: { isActive: true, deletedAt: null },
      }),

      prisma.category.count({ where: { isActive: true } }),

      // Pending jobs: QUEUED or PROCESSING generations
      prisma.generation.count({
        where: { status: { in: ["QUEUED", "PROCESSING"] } },
      }),

      // Active subscriptions
      prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "BILLING_RETRY", "GRACE_PERIOD"] } },
      }),
    ]);

    return {
      totalUsers,
      generationsToday,
      generationsTotal,
      creditsUsedToday,
      creditsUsedTotal,
      activeTemplates,
      totalCategories,
      pendingJobs,
      activeSubscriptions,
    };
  }

  /**
   * Get generation counts by day for the last N days.
   * Uses database-level grouping to avoid loading all records into memory.
   */
  async getGenerationTrends(days: number = 30): Promise<GenerationStats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Use raw SQL for date truncation + groupBy (Prisma groupBy can't group by date part)
    const rows = await prisma.$queryRaw<
      Array<{ date: string; tier: string; count: bigint }>
    >`
      SELECT
        DATE("createdAt")::text AS date,
        "qualityTier" AS tier,
        COUNT(*)::bigint AS count
      FROM "generations"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt"), "qualityTier"
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date,
      tier: r.tier,
      count: Number(r.count),
    }));
  }

  /**
   * Get AI provider cost metrics from Redis.
   */
  async getCostMetrics(): Promise<CostMetrics> {
    const today = new Date().toISOString().split("T")[0];

    let dailySpend = 0;
    try {
      const redis = getRedis();
      const raw = await redis.get(`cost:daily:${today}`);
      dailySpend = raw ? parseFloat(raw) : 0;
    } catch {
      logger.warn("Failed to read cost metrics from Redis");
    }

    // Read thresholds from SystemConfig or use defaults
    let warningThreshold = 50;
    let criticalThreshold = 65;
    let emergencyThreshold = 72;

    try {
      const configs = await prisma.systemConfig.findMany({
        where: {
          key: {
            in: [
              "cost_warning_threshold_percent",
              "cost_critical_threshold_percent",
              "cost_emergency_threshold_percent",
            ],
          },
        },
      });

      for (const cfg of configs) {
        const val = parseFloat(String(cfg.value));
        if (isNaN(val)) continue;
        if (cfg.key === "cost_warning_threshold_percent") warningThreshold = val;
        if (cfg.key === "cost_critical_threshold_percent") criticalThreshold = val;
        if (cfg.key === "cost_emergency_threshold_percent") emergencyThreshold = val;
      }
    } catch {
      // Use defaults
    }

    return {
      dailySpend,
      warningThreshold,
      criticalThreshold,
      emergencyThreshold,
      tier2Enabled: dailySpend < emergencyThreshold,
      tier3Enabled: dailySpend < criticalThreshold,
    };
  }

  /**
   * Get top templates by usage.
   */
  async getTopTemplates(limit: number = 10) {
    return prisma.template.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        usageCount: true,
        contentType: true,
        category: { select: { name: true } },
      },
      orderBy: { usageCount: "desc" },
      take: limit,
    });
  }

  /**
   * Get recent failed generations for monitoring.
   */
  async getRecentFailures(limit: number = 20) {
    return prisma.generation.findMany({
      where: { status: "FAILED" },
      select: {
        id: true,
        qualityTier: true,
        errorMessage: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

export const analyticsService = new AnalyticsService();
