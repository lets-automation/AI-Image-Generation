import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import {
  generationLimiter,
  dailyGenerationCap,
  concurrentGenerationLimiter,
} from "../middleware/rateLimiter.js";
import { videoController } from "../controllers/video.controller.js";
import {
  createVideoGenerationSchema,
  generationIdParam,
  generationListQuery,
} from "@ep/shared";

const router = Router();

router.use(authenticate);

// POST /api/v1/videos — create a new image-to-video generation
// Reuses the image rate limiters (generation limiter + daily cap +
// concurrent guard) — keeps a single quota surface across both flows.
router.post(
  "/",
  generationLimiter,
  dailyGenerationCap,
  concurrentGenerationLimiter,
  validate({ body: createVideoGenerationSchema }),
  (req, res, next) => videoController.create(req, res, next)
);

// GET /api/v1/videos — list the current user's video generations
router.get(
  "/",
  validate({ query: generationListQuery }),
  (req, res, next) => videoController.list(req, res, next)
);

// GET /api/v1/videos/:id — get a single video generation
// Status streaming reuses the existing GET /api/v1/generations/:id/status
// SSE endpoint, which already publishes both image and video updates.
router.get(
  "/:id",
  validate({ params: generationIdParam }),
  (req, res, next) => videoController.getById(req, res, next)
);

export { router as videoRoutes };
