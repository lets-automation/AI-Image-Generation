import type { Request, Response, NextFunction } from "express";
import { showcaseService } from "../../services/showcase.service.js";

export class ShowcaseController {
  /**
   * GET /admin/showcase
   * List showcase requests for admin review.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req as any).validatedQuery ?? {};
      const result = await showcaseService.listRequests({
        page: query.page ?? 1,
        limit: query.limit ?? 25,
        status: query.status,
        contentType: query.contentType,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/showcase/:id
   * Get a single showcase request.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await showcaseService.getRequest(req.params.id as string);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /admin/showcase/:id/review
   * Approve or reject a showcase request.
   */
  async review(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await showcaseService.review({
        generationId: req.params.id as string,
        adminUserId: req.userId!,
        decision: req.body.decision,
        rejectionReason: req.body.rejectionReason,
        categoryId: req.body.categoryId,
        targetCountries: req.body.targetCountries,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/showcase/counts
   * Get showcase counts for dashboard badge.
   */
  async counts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await showcaseService.getCounts();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const showcaseController = new ShowcaseController();
