import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { downloadController } from "../controllers/download.controller.js";

const router = Router();

// All download routes require authentication
router.use(authenticate);

const createDownloadSchema = z.object({
  generationId: z.string().cuid("Invalid generation ID"),
  format: z.enum(["png", "jpg", "webp"]).optional().default("png"),
  resolution: z.string().optional().default("1080x1080"),
});

const downloadListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// POST /api/v1/downloads — Create download and get signed URL
router.post(
  "/",
  validate({ body: createDownloadSchema }),
  (req, res, next) => downloadController.create(req, res, next)
);

// GET /api/v1/downloads — List user's downloads
router.get(
  "/",
  validate({ query: downloadListQuery }),
  (req, res, next) => downloadController.list(req, res, next)
);

export { router as downloadRoutes };
