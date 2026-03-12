import { v2 as cloudinary } from "cloudinary";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

export function initCloudinary(): void {
  if (
    !config.CLOUDINARY_CLOUD_NAME ||
    !config.CLOUDINARY_API_KEY ||
    !config.CLOUDINARY_API_SECRET
  ) {
    logger.warn("Cloudinary credentials not configured — uploads will fail");
    return;
  }

  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });

  logger.info("Cloudinary configured");
}

export { cloudinary };
