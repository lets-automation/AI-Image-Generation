import type { Request, Response, NextFunction } from "express";
import { festivalService } from "../services/festival.service.js";
import { prisma } from "../config/database.js";

export class FestivalController {
  // Public

  async getUpcoming(req: Request, res: Response, next: NextFunction) {
    try {
      const contentType = req.query.contentType as "EVENT" | "POSTER" | undefined;

      // Try to get user's country for country-targeted festivals
      let userCountry: string | null = null;
      if (req.userId) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { country: true } as any,
        });
        userCountry = (user as any)?.country ?? null;
      }

      const festivals = await festivalService.getVisible(contentType, userCountry);
      res.json({ success: true, data: festivals });
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const festival = await festivalService.getById(req.params.id as string);
      res.json({ success: true, data: festival });
    } catch (err) { next(err); }
  }

  // Admin 

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        contentType?: "EVENT" | "POSTER";
        upcoming?: boolean;
      };

      const result = await festivalService.list(query);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const festival = await festivalService.create({
        ...req.body,
        date: new Date(req.body.date),
      });
      res.status(201).json({ success: true, data: festival });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const festival = await festivalService.update(req.params.id as string, req.body);
      res.json({ success: true, data: festival });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await festivalService.delete(req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const festivalController = new FestivalController();
