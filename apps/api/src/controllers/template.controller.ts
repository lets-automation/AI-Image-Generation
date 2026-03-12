import type { Request, Response, NextFunction } from "express";
import { templateService } from "../services/template.service.js";
import { BadRequestError } from "../utils/errors.js";

export class TemplateController {
  // ─── Public ────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        contentType?: "EVENT" | "POSTER";
        categoryId?: string;
        isActive?: boolean;
        aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
      };

      const result = await templateService.list(query);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await templateService.getById(req.params.id as string);
      res.json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  async listGrouped(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        contentType: "EVENT" | "POSTER";
        aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
      };

      const result = await templateService.listGroupedByCategory(query);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ─── Admin ─────────────────────────────────────────────

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new BadRequestError("Template image is required");
      }

      const input = {
        name: req.body.name,
        contentType: req.body.contentType,
        categoryId: req.body.categoryId,
        safeZones: req.body.safeZones ? JSON.parse(req.body.safeZones) : [],
        metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
      };

      const template = await templateService.create(input, req.file.buffer);
      res.status(201).json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await templateService.update(req.params.id as string, req.body);
      res.json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  async updateSafeZones(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await templateService.updateSafeZones(
        req.params.id as string,
        req.body.safeZones
      );
      res.json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  async replaceImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new BadRequestError("Image file is required");
      }
      const template = await templateService.replaceImage(
        req.params.id as string,
        req.file.buffer
      );
      res.json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await templateService.delete(req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const templateController = new TemplateController();
