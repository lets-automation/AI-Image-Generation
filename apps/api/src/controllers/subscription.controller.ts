/**
 * Subscription Controller
 *
 * Handles user-facing subscription operations:
 * - Verify purchase (client sends signedTransactionInfo after Apple purchase)
 * - Get subscription status + balance
 * - Restore subscription after reinstall
 * - List available subscription plans
 */

import type { Request, Response, NextFunction } from "express";
import { subscriptionService } from "../services/subscription.service.js";
import {
  decodeSignedTransaction,
  mapToVerifiedTransaction,
  verifyJWSSignature,
} from "../services/apple/apple-api.js";
import { prisma } from "../config/database.js";
import { logger } from "../utils/logger.js";
import { BadRequestError } from "../utils/errors.js";
import { config } from "../config/index.js";

export class SubscriptionController {
  /**
   * POST /api/v1/subscriptions/verify
   *
   * Client sends the signedTransactionInfo received from StoreKit after purchase.
   * Server verifies JWS → decodes transaction → activates subscription.
   *
   * Body: { signedTransactionInfo: string }
   */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { signedTransactionInfo } = req.body as {
        signedTransactionInfo?: string;
      };

      if (!signedTransactionInfo || typeof signedTransactionInfo !== "string") {
        throw new BadRequestError("Missing signedTransactionInfo");
      }

      // Step 1: Verify JWS signature
      const isValid = verifyJWSSignature(signedTransactionInfo);
      if (!isValid) {
        throw new BadRequestError("Invalid transaction signature");
      }

      // Step 2: Decode the transaction
      const txInfo = decodeSignedTransaction(signedTransactionInfo, false); // already verified
      const verifiedTx = mapToVerifiedTransaction(txInfo);

      // Step 3: Validate environment
      if (verifiedTx.environment !== config.APPLE_ENVIRONMENT) {
        throw new BadRequestError(
          `Environment mismatch: transaction is ${verifiedTx.environment}, server expects ${config.APPLE_ENVIRONMENT}`
        );
      }

      // Step 4: Activate subscription
      const subscription = await subscriptionService.activateSubscription(
        userId,
        verifiedTx
      );

      logger.info(
        { userId, subscriptionId: subscription.id, productId: verifiedTx.productId },
        "Subscription verified and activated"
      );

      // Return subscription with plan and balance
      const status = await subscriptionService.getActiveSubscription(userId);

      res.status(201).json({
        success: true,
        data: status,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/subscriptions/status
   *
   * Returns the user's active subscription, plan details, and current credit balance.
   */
  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await subscriptionService.getActiveSubscription(userId);

      if (!result) {
        res.json({
          success: true,
          data: {
            hasActiveSubscription: false,
            subscription: null,
            balance: null,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          hasActiveSubscription: true,
          subscription: {
            id: result.subscription.id,
            planId: result.subscription.planId,
            planName: result.subscription.plan.name,
            tierAccess: result.subscription.plan.tierAccess,
            status: result.subscription.status,
            provider: result.subscription.provider,
            currentPeriodStart: result.subscription.currentPeriodStart,
            currentPeriodEnd: result.subscription.currentPeriodEnd,
            autoRenewEnabled: result.subscription.autoRenewEnabled,
            cancellationReason: result.subscription.cancellationReason,
          },
          balance: result.balance
            ? {
                remainingCredits: result.balance.remainingCredits,
                weeklyCredits: result.balance.weeklyCredits,
                periodEnd: result.balance.periodEnd,
              }
            : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/subscriptions/restore
   *
   * Restore subscription after app reinstall or device transfer.
   * Client sends the originalTransactionId from StoreKit.
   *
   * Body: { originalTransactionId: string }
   */
  async restore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { originalTransactionId } = req.body as {
        originalTransactionId?: string;
      };

      if (!originalTransactionId || typeof originalTransactionId !== "string") {
        throw new BadRequestError("Missing originalTransactionId");
      }

      const result = await subscriptionService.restoreSubscription(
        userId,
        originalTransactionId
      );

      logger.info(
        { userId, originalTransactionId, hasSubscription: !!result },
        "Subscription restored"
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/subscriptions/plans
   *
   * List all active subscription plans for pricing display.
   * Public route — no auth required (but mounted under authenticated router for consistency).
   */
  async plans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          appleProductId: true,
          priceInr: true,
          weeklyCredits: true,
          tierAccess: true,
          features: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      });

      res.json({
        success: true,
        data: plans,
      });
    } catch (err) {
      next(err);
    }
  }
  /**
   * POST /api/v1/subscriptions/cancel
   *
   * Cancel auto-renewal on the active subscription.
   * Subscription stays active until the current period ends.
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await subscriptionService.cancelSubscription(userId);

      if (!result) {
        res.json({
          success: true,
          data: {
            hasActiveSubscription: false,
            subscription: null,
            balance: null,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          hasActiveSubscription: true,
          subscription: {
            id: result.subscription.id,
            planId: result.subscription.planId,
            planName: result.subscription.plan.name,
            tierAccess: result.subscription.plan.tierAccess,
            status: result.subscription.status,
            provider: result.subscription.provider,
            currentPeriodStart: result.subscription.currentPeriodStart,
            currentPeriodEnd: result.subscription.currentPeriodEnd,
            autoRenewEnabled: result.subscription.autoRenewEnabled,
            cancellationReason: result.subscription.cancellationReason,
          },
          balance: result.balance
            ? {
                remainingCredits: result.balance.remainingCredits,
                weeklyCredits: result.balance.weeklyCredits,
                periodEnd: result.balance.periodEnd,
              }
            : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const subscriptionController = new SubscriptionController();
