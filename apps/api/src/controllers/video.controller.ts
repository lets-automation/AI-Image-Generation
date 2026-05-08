import type { Request, Response, NextFunction } from "express";
import { videoGenerationService } from "../services/video-generation.service.js";
import { generationService } from "../services/generation.service.js";
import { prisma } from "../config/database.js";
import { ForbiddenError } from "../utils/errors.js";

export class VideoController {
  /**
   * POST /api/v1/videos
   * Create a new image-to-video generation request.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { canGenerate: true, role: true },
      });
      const isAdmin =
        user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
      if (!isAdmin && !user?.canGenerate) {
        throw new ForbiddenError(
          "You do not have permission to generate videos."
        );
      }

      const result = await videoGenerationService.create({
        userId: req.userId!,
        templateId: req.body.templateId,
        baseImageUrls: req.body.baseImageUrls,
        qualityTier: req.body.qualityTier,
        durationSec: req.body.durationSec,
        prompt: req.body.prompt,
        prompts: req.body.prompts,
      });

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/videos
   * List the current user's video generations.
   *
   * Reuses generationService.list with a jobType=VIDEO filter so pagination,
   * formatting, and ownership scoping stay in one place.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as {
        page?: number;
        limit?: number;
        status?: string;
      } | undefined;

      const result = await generationService.list(req.userId!, {
        page: query?.page,
        limit: query?.limit,
        status: query?.status,
        jobType: "VIDEO",
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/videos/:id
   * Get a single video generation. Delegates to generationService so the
   * response shape stays in sync with the image flow's `getById`.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await generationService.getById(
        req.params.id as string,
        req.userId!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const videoController = new VideoController();
