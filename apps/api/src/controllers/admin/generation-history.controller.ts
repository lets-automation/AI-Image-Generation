import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database.js";

class GenerationHistoryController {
  /**
   * List generations with full details: model used, processing time, provider, cost, status.
   * Paginated with filters for status, tier, provider.
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const skip = (page - 1) * limit;

      const status = req.query.status as string | undefined;
      const qualityTier = req.query.qualityTier as string | undefined;
      const provider = req.query.provider as string | undefined;
      const userId = req.query.userId as string | undefined;
      const batchId = req.query.batchId as string | undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (qualityTier) where.qualityTier = qualityTier;
      if (userId) where.userId = userId;
      if (batchId) where.batchId = batchId;

      // Filter by provider (stored inside providerConfig JSONB)
      // We use Prisma's JSON path filter
      if (provider) {
        where.providerConfig = { path: ["providerUsed"], equals: provider };
      }

      const [generations, total] = await Promise.all([
        prisma.generation.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, email: true } },
            template: { select: { id: true, name: true, imageUrl: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.generation.count({ where }),
      ]);

      // Format the response with extracted provider details
      const data = generations.map((g) => {
        const config = g.providerConfig as Record<string, unknown> | null;
        return {
          id: g.id,
          userId: g.userId,
          user: g.user,
          template: g.template,
          contentType: g.contentType,
          qualityTier: g.qualityTier,
          language: g.language,
          orientation: g.orientation,
          status: g.status,
          creditCost: g.creditCost,
          processingMs: g.processingMs,
          // Extracted from providerConfig JSONB
          providerUsed: config?.providerUsed ?? null,
          aiCostCents: config?.aiCostCents ?? null,
          effectiveTier: config?.effectiveTier ?? null,
          modelId: config?.model ?? config?.modelId ?? null,
          // Result
          resultImageUrl: g.resultImageUrl,
          errorMessage: g.errorMessage,
          batchId: g.batchId,
          createdAt: g.createdAt,
        };
      });

      res.json({
        success: true,
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get detailed stats summary: total generations, avg processing time,
   * provider breakdown, tier breakdown, success/failure rates.
   */
  async stats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [total, completed, failed, avgProcessing, byTier, recent24h] = await Promise.all([
        prisma.generation.count(),
        prisma.generation.count({ where: { status: "COMPLETED" } }),
        prisma.generation.count({ where: { status: "FAILED" } }),
        prisma.generation.aggregate({
          _avg: { processingMs: true },
          where: { status: "COMPLETED", processingMs: { not: null } },
        }),
        prisma.generation.groupBy({
          by: ["qualityTier"],
          _count: true,
          where: { status: "COMPLETED" },
        }),
        prisma.generation.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          completed,
          failed,
          successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0",
          avgProcessingMs: Math.round(avgProcessing._avg.processingMs ?? 0),
          byTier: byTier.map((t) => ({ tier: t.qualityTier, count: t._count })),
          last24h: recent24h,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const generationHistoryController = new GenerationHistoryController();
