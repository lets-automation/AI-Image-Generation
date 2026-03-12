/**
 * Admin Subscription Plan Controller
 *
 * CRUD operations for SubscriptionPlan management.
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database.js";
import { NotFoundError } from "../../utils/errors.js";

export class SubscriptionPlanController {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { subscriptions: true } },
        },
      });
      res.json({ success: true, data: plans });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: req.params.id as string },
        include: {
          _count: { select: { subscriptions: true } },
        },
      });
      if (!plan) throw new NotFoundError("Subscription plan");
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: req.body.name,
          appleProductId: req.body.appleProductId,
          googleProductId: req.body.googleProductId ?? null,
          weeklyCredits: req.body.weeklyCredits,
          tierAccess: req.body.tierAccess,
          priceInr: req.body.priceInr,
          sortOrder: req.body.sortOrder ?? 0,
          features: req.body.features ?? null,
          isActive: req.body.isActive ?? true,
        },
      });
      res.status(201).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.subscriptionPlan.findUnique({
        where: { id: req.params.id as string },
      });
      if (!existing) throw new NotFoundError("Subscription plan");

      const plan = await prisma.subscriptionPlan.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.subscriptionPlan.findUnique({
        where: { id: req.params.id as string },
        include: { _count: { select: { subscriptions: true } } },
      });
      if (!existing) throw new NotFoundError("Subscription plan");

      // Soft-delete: deactivate instead of deleting if subscriptions exist
      if (existing._count.subscriptions > 0) {
        await prisma.subscriptionPlan.update({
          where: { id: req.params.id as string },
          data: { isActive: false },
        });
        res.json({ success: true, message: "Plan deactivated (has active subscriptions)" });
      } else {
        await prisma.subscriptionPlan.delete({
          where: { id: req.params.id as string },
        });
        res.json({ success: true });
      }
    } catch (err) {
      next(err);
    }
  }
}

export const subscriptionPlanController = new SubscriptionPlanController();
