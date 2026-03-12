import type { Request, Response, NextFunction } from "express";
import { pricingService } from "../../services/pricing.service.js";

export class PricingController {
  // ─── Model Pricing ─────────────────────────────────────

  async listModelPricing(req: Request, res: Response, next: NextFunction) {
    try {
      const tier = req.query.tier as "BASIC" | "STANDARD" | "PREMIUM" | undefined;
      const pricing = await pricingService.listModelPricing(tier);
      res.json({ success: true, data: pricing });
    } catch (err) { next(err); }
  }

  async createModelPricing(req: Request, res: Response, next: NextFunction) {
    try {
      const pricing = await pricingService.createModelPricing(req.body);
      res.status(201).json({ success: true, data: pricing });
    } catch (err) { next(err); }
  }

  async updateModelPricing(req: Request, res: Response, next: NextFunction) {
    try {
      const pricing = await pricingService.updateModelPricing(req.params.id as string, req.body);
      res.json({ success: true, data: pricing });
    } catch (err) { next(err); }
  }

  async deleteModelPricing(req: Request, res: Response, next: NextFunction) {
    try {
      await pricingService.deleteModelPricing(req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const pricingController = new PricingController();
