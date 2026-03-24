import type { Request, Response, NextFunction } from "express";
import { categoryService } from "../services/category.service.js";
import { festivalService } from "../services/festival.service.js";

export class CategoryController {
  // Public

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        contentType?: "EVENT" | "POSTER";
        isActive?: boolean;
      };

      const result = await categoryService.list(query);

      // Augment with festival promotion data
      const promoMap = await festivalService.getPromotedCategoryMap(
        query.contentType as "EVENT" | "POSTER" | undefined
      );

      const augmented = result.data.map((cat: any) => ({
        ...cat,
        promoted: promoMap.has(cat.id),
        festivalName: promoMap.get(cat.id)?.festivalName ?? null,
      }));

      // Sort: promoted first (by sortOrder), then non-promoted (by original sortOrder)
      augmented.sort((a: any, b: any) => {
        if (a.promoted && !b.promoted) return -1;
        if (!a.promoted && b.promoted) return 1;
        if (a.promoted && b.promoted) {
          return (promoMap.get(a.id)?.sortOrder ?? 0) - (promoMap.get(b.id)?.sortOrder ?? 0);
        }
        return 0; // keep original order for non-promoted
      });

      res.json({ success: true, data: augmented, meta: result.meta });
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoryService.getById(req.params.id as string);
      res.json({ success: true, data: category });
    } catch (err) { next(err); }
  }

  async getFields(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoryService.getById(req.params.id as string);
      res.json({ success: true, data: category.fieldSchemas });
    } catch (err) { next(err); }
  }

  // Admin

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoryService.create(req.body);
      res.status(201).json({ success: true, data: category });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoryService.update(req.params.id as string, req.body);
      res.json({ success: true, data: category });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await categoryService.delete(req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Field Schema Management

  async addField(req: Request, res: Response, next: NextFunction) {
    try {
      const field = await categoryService.addField(req.params.id as string, req.body);
      res.status(201).json({ success: true, data: field });
    } catch (err) { next(err); }
  }

  async updateField(req: Request, res: Response, next: NextFunction) {
    try {
      const field = await categoryService.updateField(req.params.fieldId as string, req.body);
      res.json({ success: true, data: field });
    } catch (err) { next(err); }
  }

  async deleteField(req: Request, res: Response, next: NextFunction) {
    try {
      await categoryService.deleteField(req.params.fieldId as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  async reorderFields(req: Request, res: Response, next: NextFunction) {
    try {
      const fields = await categoryService.reorderFields(
        req.params.id as string,
        req.body.fieldOrders
      );
      res.json({ success: true, data: fields });
    } catch (err) { next(err); }
  }
}

export const categoryController = new CategoryController();
