import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { prisma } from "../config/database.js";
import { GENERATION_LIMITS, RATE_LIMITS } from "@ep/shared";
import { TooManyRequestsError } from "../utils/errors.js";

/**
 * Global rate limiter — applies to all routes.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.RATE_LIMIT_GLOBAL_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // trust proxy is set on the app
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests, please try again later",
    },
  },
});

/**
 * Auth endpoints rate limiter — brute force protection.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_AUTH_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many authentication attempts, please try again later",
    },
  },
});

/**
 * Generation rate limiter — per-user cooldown.
 */
export const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_GENERATION_PER_MIN,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "GENERATION_COOLDOWN",
      message: "Generation cooldown active, please wait before generating again",
    },
  },
});

/**
 * Upload rate limiter — prevent upload spam.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.UPLOAD_PER_MIN,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_UPLOADS",
      message: "Too many uploads, please wait before uploading again",
    },
  },
});

/**
 * Daily generation cap — enforce per-user daily generation limit.
 * Checks DB for today's generation count.
 */
export async function dailyGenerationCap(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  if (!userId) return next();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Read cap from SystemConfig (admin-adjustable), fallback to shared constant
    let dailyCap: number = GENERATION_LIMITS.DAILY_GENERATION_CAP_DEFAULT;
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: "daily_generation_cap" } });
      if (cfg?.value !== null && cfg?.value !== undefined) {
        const parsed = parseInt(String(cfg.value), 10);
        if (!isNaN(parsed) && parsed > 0) dailyCap = parsed;
      }
    } catch {
      // Use default
    }

    const count = await prisma.generation.count({
      where: {
        userId,
        createdAt: { gte: today },
      },
    });

    if (count >= dailyCap) {
      return next(
        new TooManyRequestsError(
          `Daily generation limit reached (${dailyCap}). Please try again tomorrow.`
        )
      );
    }

    next();
  } catch {
    // Fail open — don't block users due to DB errors
    next();
  }
}

/**
 * Concurrent generation limiter — prevent too many active jobs per user.
 */
export async function concurrentGenerationLimiter(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  if (!userId) return next();

  try {
    const activeCount = await prisma.generation.count({
      where: {
        userId,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    });

    if (activeCount >= GENERATION_LIMITS.MAX_CONCURRENT_JOBS_PER_USER) {
      return next(
        new TooManyRequestsError(
          `You have ${activeCount} active generations. Please wait for them to complete.`
        )
      );
    }

    next();
  } catch {
    next();
  }
}
