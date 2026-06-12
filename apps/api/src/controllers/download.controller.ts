import type { Request, Response, NextFunction } from "express";
import { downloadService } from "../services/download.service.js";

export class DownloadController {
  /**
   * POST /api/v1/downloads
   * Create a download record and get signed URL.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await downloadService.createDownload(
        req.userId!,
        req.body.generationId,
        req.body.format,
        req.body.resolution
      );

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/downloads
   * List user's downloads.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as {
        page?: number;
        limit?: number;
      } | undefined;

      const result = await downloadService.listDownloads(
        req.userId!,
        query?.page,
        query?.limit
      );

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/downloads/:id
   * Delete a download record owned by the requesting user.
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await downloadService.deleteDownload(req.userId!, req.params.id as string);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
}

export const downloadController = new DownloadController();
