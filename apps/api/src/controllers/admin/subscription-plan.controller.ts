/**
 * Admin Subscription Plan Controller
 *
 * CRUD operations for SubscriptionPlan management.
 * Includes Razorpay plan creation via their Plans API.
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database.js";
import { NotFoundError, BadRequestError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

// ─── Razorpay helper ─────────────────────────────────────

async function createRazorpayPlanOnProvider(planName: string, amountPaise: number) {
  // Lazy-import to avoid top-level errors if Razorpay creds are missing
  const { credentialService } = await import("../../services/credential.service.js");
  const Razorpay = (await import("razorpay")).default;

  const keyId = await credentialService.getCredentialOrEnv("razorpay_key_id");
  const keySecret = await credentialService.getCredentialOrEnv("razorpay_key_secret");

  if (!keyId || !keySecret) {
    throw new BadRequestError(
      "Razorpay credentials not configured. Set Key ID and Key Secret in Settings → Razorpay."
    );
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const rzpPlan = await razorpay.plans.create({
    period: "weekly",
    interval: 1,
    item: {
      name: planName,
      amount: amountPaise,
      currency: "INR",
      description: `${planName} — Weekly subscription`,
    },
  });

  logger.info({ razorpayPlanId: rzpPlan.id, planName }, "Razorpay plan created");
  return rzpPlan.id;
}

// ─── Controller ──────────────────────────────────────────

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
      const {
        name,
        appleProductId,
        googleProductId,
        weeklyCredits,
        tierAccess,
        priceInr,
        sortOrder,
        features,
        isActive,
        createRazorpayPlan,
      } = req.body;

      // Optionally create a Razorpay plan
      let razorpayPlanId: string | null = null;
      if (createRazorpayPlan) {
        razorpayPlanId = await createRazorpayPlanOnProvider(name, priceInr);
      }

      const plan = await prisma.subscriptionPlan.create({
        data: {
          name,
          appleProductId: appleProductId || null,
          googleProductId: googleProductId ?? null,
          razorpayPlanId,
          weeklyCredits,
          tierAccess,
          priceInr,
          sortOrder: sortOrder ?? 0,
          features: features ?? null,
          isActive: isActive ?? true,
        },
      });
      res.status(201).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /subscription-plans/:id/razorpay-plan
   * Create a Razorpay plan for an existing subscription plan that doesn't have one.
   */
  async createRazorpayPlanForExisting(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.subscriptionPlan.findUnique({
        where: { id: req.params.id as string },
      });
      if (!existing) throw new NotFoundError("Subscription plan");

      if (existing.razorpayPlanId) {
        throw new BadRequestError(
          `This plan already has a Razorpay Plan ID: ${existing.razorpayPlanId}`
        );
      }

      const razorpayPlanId = await createRazorpayPlanOnProvider(existing.name, existing.priceInr);

      const updated = await prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: { razorpayPlanId },
        include: { _count: { select: { subscriptions: true } } },
      });

      res.json({ success: true, data: updated });
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
