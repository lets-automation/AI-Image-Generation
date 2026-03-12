import type { Request, Response, NextFunction } from "express";
import { analyticsService } from "../../services/analytics.service.js";

class AnalyticsController {
  async dashboard(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await analyticsService.getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  async trends(req: Request, res: Response, next: NextFunction) {
    try {
      const days = Number(req.query.days) || 30;
      const trends = await analyticsService.getGenerationTrends(days);
      res.json({ success: true, data: trends });
    } catch (err) {
      next(err);
    }
  }

  async costs(_req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await analyticsService.getCostMetrics();
      res.json({ success: true, data: metrics });
    } catch (err) {
      next(err);
    }
  }

  async topTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 10;
      const templates = await analyticsService.getTopTemplates(limit);
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  }

  async recentFailures(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 20;
      const failures = await analyticsService.getRecentFailures(limit);
      res.json({ success: true, data: failures });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
