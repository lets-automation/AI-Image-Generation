import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { z } from "zod";
import { prisma } from "../config/database.js";
import type { Request, Response, NextFunction } from "express";
import { uploadLogo, uploadBaseImage, scanUploadedImage } from "../middleware/upload.js";
import { uploadToCloudinary } from "../engine/upload/cloudinary.js";

const router = Router();

router.use(authenticate);

// GET /me — Get current user profile
router.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: { generations: true, downloads: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /me — Update current user profile
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z.string().min(10).max(15).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

router.patch(
  "/me",
  validate({ body: updateProfileSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      const body = req.body;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: body,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /me/upload-logo — Upload logo to Cloudinary
router.post(
  "/upload-logo",
  uploadLogo,
  scanUploadedImage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, message: "No logo provided" });
      }

      const userId = req.userId;
      const folder = `users/${userId}/logos`;

      const result = await uploadToCloudinary(req.file.buffer, folder);

      res.json({
        success: true,
        data: { url: result.secureUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /upload-base-image — Upload a user's base image to Cloudinary (for generation without template)
const MIN_BASE_IMAGE_DIMENSION = 768;
const RECOMMENDED_MIN_DIMENSION = 1024;

router.post(
  "/upload-base-image",
  uploadBaseImage,
  scanUploadedImage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, message: "No image provided" });
      }

      const userId = req.userId;
      const metadata = (req as any).imageMetadata as { width: number; height: number; format: string } | undefined;
      const width = metadata?.width ?? 0;
      const height = metadata?.height ?? 0;

      // Hard reject images below minimum
      if (width < MIN_BASE_IMAGE_DIMENSION || height < MIN_BASE_IMAGE_DIMENSION) {
        return res.status(400).json({
          success: false,
          message: `Image too small: ${width}x${height}. Minimum ${MIN_BASE_IMAGE_DIMENSION}x${MIN_BASE_IMAGE_DIMENSION}px required for AI generation.`,
        });
      }

      // Build warnings for suboptimal dimensions
      const warnings: string[] = [];
      if (width < RECOMMENDED_MIN_DIMENSION || height < RECOMMENDED_MIN_DIMENSION) {
        warnings.push(
          `Image is ${width}x${height}px. For best AI generation results, we recommend at least ${RECOMMENDED_MIN_DIMENSION}x${RECOMMENDED_MIN_DIMENSION}px.`
        );
      }

      const folder = `users/${userId}/base-images`;
      const result = await uploadToCloudinary(req.file.buffer, folder);

      res.json({
        success: true,
        data: {
          url: result.secureUrl,
          width,
          height,
          warnings,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export { router as userRoutes };
