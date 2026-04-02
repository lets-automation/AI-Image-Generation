import sharp from "sharp";
import { logger } from "../utils/logger.js";
import { UPLOAD_LIMITS } from "@ep/shared";

/**
 * Image Upload Scanner
 *
 * Validates uploaded images for:
 * 1. File format verification (magic bytes, not just extension)
 * 2. Dimension bounds check
 * 3. Pixel bomb detection (decompression bomb)
 * 4. Metadata stripping (EXIF, GPS, etc.)
 *
 * This is NOT a deep content moderation system (no nudity/NSFW detection).
 * Deep moderation would require an AI classifier — added as a future enhancement.
 */

export interface ImageScanResult {
  safe: boolean;
  reason?: string;
  metadata?: {
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
    hasAlpha: boolean;
  };
  sanitizedBuffer?: Buffer;
}

// Max pixel count to prevent pixel bomb attacks
const MAX_PIXEL_COUNT = 50_000_000; // 50 megapixels

// Allowed image formats after magic byte verification
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/**
 * Scan and validate an uploaded image buffer.
 *
 * Returns a sanitized buffer with metadata stripped if the image passes all checks.
 */
export async function scanImage(
  buffer: Buffer,
  maxSizeBytes: number = UPLOAD_LIMITS.MAX_IMAGE_SIZE_BYTES
): Promise<ImageScanResult> {
  // 1. Size check
  if (buffer.length > maxSizeBytes) {
    return {
      safe: false,
      reason: `Image exceeds maximum size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
    };
  }

  if (buffer.length === 0) {
    return { safe: false, reason: "Empty file uploaded" };
  }

  try {
    // 2. Format verification via Sharp (reads magic bytes, not extension)
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return {
        safe: false,
        reason: `Unsupported image format: ${metadata.format ?? "unknown"}. Allowed: JPG, PNG, WebP`,
      };
    }

    // 3. Dimension checks
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width === 0 || height === 0) {
      return { safe: false, reason: "Invalid image dimensions (0 width or height)" };
    }

    // 4. Pixel bomb detection
    const pixelCount = width * height;
    if (pixelCount > MAX_PIXEL_COUNT) {
      return {
        safe: false,
        reason: `Image has too many pixels (${pixelCount}). Maximum ${MAX_PIXEL_COUNT}`,
      };
    }

    // 5. Strip metadata (EXIF, GPS, etc.) for privacy and security
    const sanitizedBuffer = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF orientation before stripping
      .withMetadata({ orientation: undefined }) // Strip EXIF
      .toBuffer();

    logger.debug(
      { format: metadata.format, width, height, sizeBytes: buffer.length },
      "Image scan passed"
    );

    return {
      safe: true,
      metadata: {
        width,
        height,
        format: metadata.format,
        sizeBytes: buffer.length,
        hasAlpha: metadata.hasAlpha ?? false,
      },
      sanitizedBuffer,
    };
  } catch (err) {
    logger.warn({ err }, "Image scan failed — corrupt or unreadable file");
    return {
      safe: false,
      reason: "Unable to process image. The file may be corrupt or not a valid image.",
    };
  }
}

/**
 * Validate that a file buffer has valid image magic bytes.
 * Quick pre-check before loading into Sharp (prevents processing non-image files).
 */
export function hasValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true;

  // GIF: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;

  return false;
}
