import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { logger } from "../../utils/logger.js";

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/**
 * Upload a buffer to Cloudinary.
 *
 * @param buffer - Image data
 * @param folder - Cloudinary folder path
 * @param publicId - Optional specific public ID
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder,
      resource_type: "image",
      format: "png",
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error({ error, folder }, "Cloudinary upload failed");
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }

        resolve({
          publicId: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    // Stream the buffer to Cloudinary
    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
}

/**
 * Upload a video buffer to Cloudinary.
 *
 * Mirrors {@link uploadToCloudinary} but with `resource_type: "video"` so the
 * asset is stored in Cloudinary's video pipeline (which is required for video
 * delivery URLs and any later transformation/streaming features).
 *
 * @param buffer - Video data (e.g., mp4)
 * @param folder - Cloudinary folder path
 * @param publicId - Optional specific public ID
 * @param format - Container format (default "mp4")
 */
export async function uploadVideoToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId?: string,
  format = "mp4"
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder,
      resource_type: "video",
      format,
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error({ error, folder }, "Cloudinary video upload failed");
          reject(new Error(`Cloudinary video upload failed: ${error.message}`));
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary video upload returned no result"));
          return;
        }

        resolve({
          publicId: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          // Cloudinary returns width/height for video too (frame dimensions).
          // Default to 0 if missing so the type stays clean.
          width: result.width ?? 0,
          height: result.height ?? 0,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Delete a video asset from Cloudinary.
 *
 * Cloudinary requires `resource_type: "video"` to look up video assets — the
 * default image-only `destroy()` silently misses them.
 */
export async function deleteVideoFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
  } catch (err) {
    logger.warn({ publicId, err }, "Failed to delete video from Cloudinary");
  }
}

/**
 * Generate a signed download URL for a Cloudinary image.
 *
 * @param publicId - Cloudinary public ID
 * @param expiresInSeconds - URL expiry (default 1 hour)
 */
export function getSignedUrl(
  publicId: string,
  expiresInSeconds = 3600
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.url(publicId, {
    sign_url: true,
    type: "upload",
    resource_type: "image",
    expires_at: expiresAt,
    secure: true,
    flags: "attachment",
  });
}

/**
 * Generate a signed download URL for a Cloudinary video asset.
 */
export function getSignedVideoUrl(
  publicId: string,
  expiresInSeconds = 3600
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.url(publicId, {
    sign_url: true,
    type: "upload",
    resource_type: "video",
    expires_at: expiresAt,
    secure: true,
    flags: "attachment",
  });
}

/**
 * Delete an image from Cloudinary.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn({ publicId, err }, "Failed to delete from Cloudinary");
  }
}
