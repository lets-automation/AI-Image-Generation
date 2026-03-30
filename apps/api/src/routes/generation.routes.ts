import { Router } from "express";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import {
  generationLimiter,
  dailyGenerationCap,
  concurrentGenerationLimiter,
} from "../middleware/rateLimiter.js";
import { generationController } from "../controllers/generation.controller.js";
import {
  createGenerationSchema,
  generationIdParam,
  generationListQuery,
  GENERATION_LIMITS,
} from "@ep/shared";
import { prisma } from "../config/database.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// GET /api/v1/generations/public — List all public generations (no auth required)
router.get(
  "/public",
  optionalAuth,
  validate({ query: generationListQuery }),
  (req, res, next) => generationController.listPublic(req, res, next)
);

// ── All routes below require authentication ──
router.use(authenticate);

// GET /api/v1/generations/limits — Get user's daily generation limits and remaining count
router.get(
  "/limits",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Read cap from SystemConfig
      let dailyCap: number = GENERATION_LIMITS.DAILY_GENERATION_CAP_DEFAULT;
      try {
        const cfg = await prisma.systemConfig.findUnique({ where: { key: "daily_generation_cap" } });
        if (cfg?.value !== null && cfg?.value !== undefined) {
          const parsed = parseInt(String(cfg.value), 10);
          if (!isNaN(parsed) && parsed > 0) dailyCap = parsed;
        }
      } catch { /* use default */ }

      // Count today's generations for this user
      const usedToday = await prisma.generation.count({
        where: { userId, createdAt: { gte: today } },
      });

      res.json({
        success: true,
        data: {
          dailyLimit: dailyCap,
          usedToday,
          remaining: Math.max(0, dailyCap - usedToday),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/generations/tier-pricing — Get effective per-tier credit costs
router.get(
  "/tier-pricing",
  (req, res, next) => generationController.tierPricing(req, res, next)
);

// POST /api/v1/generations — Create new generation
// Protected by: rate limiter + daily cap + concurrent limit + Zod validation
router.post(
  "/",
  generationLimiter,
  dailyGenerationCap,
  concurrentGenerationLimiter,
  validate({ body: createGenerationSchema }),
  (req, res, next) => generationController.create(req, res, next)
);

// GET /api/v1/generations — List user's generations
router.get(
  "/",
  validate({ query: generationListQuery }),
  (req, res, next) => generationController.list(req, res, next)
);

// GET /api/v1/generations/batch/:batchId — Get batch status (multi-language)
router.get(
  "/batch/:batchId",
  (req, res, next) => generationController.getBatch(req, res, next)
);

// GET /api/v1/generations/:id — Get single generation
router.get(
  "/:id",
  validate({ params: generationIdParam }),
  (req, res, next) => generationController.getById(req, res, next)
);

// GET /api/v1/generations/:id/status — SSE status stream
router.get(
  "/:id/status",
  validate({ params: generationIdParam }),
  (req, res, next) => generationController.statusSSE(req, res, next)
);

export { router as generationRoutes };
