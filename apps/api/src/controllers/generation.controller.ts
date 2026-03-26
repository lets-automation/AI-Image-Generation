import type { Request, Response, NextFunction } from "express";
import { generationService } from "../services/generation.service.js";
import { IDEMPOTENCY } from "@ep/shared";
import { prisma } from "../config/database.js";
import { ForbiddenError } from "../utils/errors.js";

export class GenerationController {
  /**
   * POST /api/v1/generations
   * Create a new generation request.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idempotencyKey = req.headers[
        IDEMPOTENCY.HEADER_NAME.toLowerCase()
      ] as string | undefined;

      // 1. Check generation access
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { canGenerate: true, role: true }
      });
      
      // SUPER_ADMIN and ADMIN always have generation access
      const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
      if (!isAdmin && !user?.canGenerate) {
        throw new ForbiddenError("You do not have permission to generate images.");
      }

      const result = await generationService.create({
        userId: req.userId!,
        templateId: req.body.templateId,
        baseImageUrl: req.body.baseImageUrl,
        contentType: req.body.contentType,
        categoryId: req.body.categoryId,
        qualityTier: req.body.qualityTier,
        orientation: req.body.orientation,
        prompt: req.body.prompt,
        fieldValues: req.body.fieldValues,
        positionMap: req.body.positionMap,
        languages: req.body.languages,
        isPublic: req.body.isPublic,
        idempotencyKey,
      });

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/generations
   * List user's generations.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req as Request & { validatedQuery?: Record<string, unknown> }).validatedQuery as {
        page?: number;
        limit?: number;
        status?: string;
        contentType?: string;
      } | undefined;

      const result = await generationService.list(req.userId!, {
        page: query?.page,
        limit: query?.limit,
        status: query?.status,
        contentType: query?.contentType,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/generations/public
   * List approved public generations, filtered by user's country.
   */
  async listPublic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req as Request & { validatedQuery?: Record<string, unknown> }).validatedQuery as {
        page?: number;
        limit?: number;
        contentType?: string;
        country?: string;
      } | undefined;

      // Use country from query param, or try to detect from authenticated user
      let country = query?.country ?? null;
      if (!country && req.userId) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { country: true } as any,
        });
        country = (user as any)?.country ?? null;
      }

      const result = await generationService.listPublic({
        page: query?.page,
        limit: query?.limit,
        contentType: query?.contentType,
        country,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/generations/batch/:batchId
   * Get all generations in a multi-language batch.
   */
  async getBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await generationService.getBatch(
        req.params.batchId as string,
        req.userId!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/generations/:id
   * Get a single generation.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await generationService.getById(
        req.params.id as string,
        req.userId!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/generations/:id/status (SSE)
   * Server-Sent Events stream for generation progress.
   */
  async statusSSE(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const generationId = req.params.id as string;
      const userId = req.userId!;

      // Verify ownership first
      await generationService.getById(generationId, userId);

      // Set SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      });

      // Send initial status
      const sendStatus = async () => {
        try {
          const status = await generationService.getStatus(generationId, userId);
          res.write(`data: ${JSON.stringify(status)}\n\n`);
          return status;
        } catch {
          return null;
        }
      };

      // Send initial event
      const initial = await sendStatus();
      if (!initial) {
        res.end();
        return;
      }

      // If already complete or failed, close immediately
      if (initial.status === "COMPLETED" || initial.status === "FAILED" || initial.status === "CANCELLED") {
        res.end();
        return;
      }

      // Poll DB for status updates every 2 seconds
      const interval = setInterval(async () => {
        const status = await sendStatus();
        if (
          !status ||
          status.status === "COMPLETED" ||
          status.status === "FAILED" ||
          status.status === "CANCELLED"
        ) {
          clearInterval(interval);
          res.end();
        }
      }, 2000);

      // Also subscribe to Redis pub/sub for real-time updates
      let redisSub: ReturnType<typeof import("../config/redis.js").getRedis> | null = null;
      try {
        const { getRedis } = await import("../config/redis.js");
        redisSub = getRedis().duplicate();
        const channel = `generation:${generationId}:status`;

        await redisSub.subscribe(channel);
        redisSub.on("message", (_ch: string, message: string) => {
          try {
            res.write(`data: ${message}\n\n`);
            const parsed = JSON.parse(message);
            if (
              parsed.status === "COMPLETED" ||
              parsed.status === "FAILED" ||
              parsed.status === "CANCELLED"
            ) {
              clearInterval(interval);
              redisSub?.unsubscribe();
              redisSub?.quit();
              res.end();
            }
          } catch {
            // Ignore parse errors
          }
        });
      } catch {
        // Redis sub failed — polling fallback will handle it
      }

      // Cleanup on client disconnect
      req.on("close", () => {
        clearInterval(interval);
        if (redisSub) {
          redisSub.unsubscribe().catch(() => {});
          redisSub.quit().catch(() => {});
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        if (redisSub) {
          redisSub.unsubscribe().catch(() => {});
          redisSub.quit().catch(() => {});
        }
        res.write(`data: ${JSON.stringify({ status: "TIMEOUT", progress: 0 })}\n\n`);
        res.end();
      }, 5 * 60 * 1000);
    } catch (err) {
      next(err);
    }
  }
}

export const generationController = new GenerationController();
