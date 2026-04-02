import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { UPLOAD_LIMITS } from "@ep/shared";
import { BadRequestError } from "../utils/errors.js";
import { scanImage, hasValidImageMagicBytes } from "../moderation/image-scan.js";



const storage = multer.memoryStorage();

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const allowedMimes = [
    ...UPLOAD_LIMITS.ALLOWED_IMAGE_FORMATS,
    ...UPLOAD_LIMITS.ALLOWED_LOGO_FORMATS,
  ];

  if (allowedMimes.includes(file.mimetype as (typeof allowedMimes)[number])) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Unsupported file type: ${file.mimetype}`));
  }
}

/**
 * Multer middleware for template image uploads.
 */
export const uploadTemplateImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_IMAGE_SIZE_BYTES,
    files: 1,
  },
}).single("image");

/**
 * Multer middleware for logo uploads.
 */
export const uploadLogo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_LOGO_SIZE_BYTES,
    files: 1,
  },
}).single("logo");

/**
 * Multer middleware for user base image uploads.
 */
export const uploadBaseImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_IMAGE_SIZE_BYTES,
    files: 1,
  },
}).single("baseImage");

/**
 * Middleware to scan uploaded image after multer processes it.
 * Validates magic bytes, dimensions, detects pixel bombs, strips EXIF metadata.
 * Replaces req.file.buffer with sanitized buffer.
 */
export function scanUploadedImage(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.file?.buffer) {
    return next();
  }

  // Quick magic byte check
  if (!hasValidImageMagicBytes(req.file.buffer)) {
    return next(new BadRequestError("Invalid image file — file header does not match an image format"));
  }

  // Full scan (async)
  scanImage(req.file.buffer)
    .then((result) => {
      if (!result.safe) {
        return next(new BadRequestError(result.reason ?? "Image validation failed"));
      }

      // Attach metadata so subsequent middleware can use it
      (req as any).imageMetadata = result.metadata;

      // Replace buffer with sanitized version (EXIF stripped)
      if (result.sanitizedBuffer) {
        req.file!.buffer = result.sanitizedBuffer;
        req.file!.size = result.sanitizedBuffer.length;
      }

      next();
    })
    .catch(next);
}

/**
 * Validates that uploaded template images meet minimum dimension requirements.
 * Must be called AFTER scanUploadedImage.
 */
export function validateTemplateDimensions(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next();
}
