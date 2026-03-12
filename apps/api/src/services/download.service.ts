import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";
import { getSignedUrl } from "../engine/upload/cloudinary.js";
import { logger } from "../utils/logger.js";

// ─── Service ─────────────────────────────────────────────

export class DownloadService {
  /**
   * Create a download record and return a signed Cloudinary URL.
   *
   * Only works for COMPLETED generations owned by the requesting user.
   */
  async createDownload(
    userId: string,
    generationId: string,
    format = "png",
    resolution = "1080x1080"
  ) {
    // Verify generation exists and belongs to user
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      select: {
        id: true,
        userId: true,
        status: true,
        resultImageUrl: true,
        resultPublicId: true,
      },
    });

    if (!generation || generation.userId !== userId) {
      throw new NotFoundError("Generation");
    }

    if (generation.status !== "COMPLETED") {
      throw new NotFoundError("Completed generation");
    }

    if (!generation.resultImageUrl) {
      throw new NotFoundError("Generation result image");
    }

    // Create download record
    const download = await prisma.download.create({
      data: {
        userId,
        generationId,
        format,
        resolution,
      },
    });

    // Generate signed URL (if we have a publicId, use signed URL; otherwise use direct URL)
    let downloadUrl: string;
    if (generation.resultPublicId) {
      downloadUrl = getSignedUrl(generation.resultPublicId, 3600);
    } else {
      downloadUrl = generation.resultImageUrl;
    }

    logger.info(
      { downloadId: download.id, generationId, userId },
      "Download created"
    );

    return {
      id: download.id,
      generationId,
      downloadUrl,
      format,
      resolution,
      downloadedAt: download.downloadedAt.toISOString(),
    };
  }

  /**
   * List user's downloads with pagination.
   */
  async listDownloads(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [downloads, total] = await Promise.all([
      prisma.download.findMany({
        where: { userId },
        include: {
          generation: {
            select: {
              id: true,
              status: true,
              qualityTier: true,
              language: true,
              contentType: true,
              resultImageUrl: true,
              prompt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { downloadedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.download.count({ where: { userId } }),
    ]);

    return {
      data: downloads.map((d) => ({
        id: d.id,
        generationId: d.generationId,
        format: d.format,
        resolution: d.resolution,
        downloadedAt: d.downloadedAt.toISOString(),
        generation: d.generation
          ? {
              id: d.generation.id,
              status: d.generation.status,
              qualityTier: d.generation.qualityTier,
              language: d.generation.language,
              contentType: d.generation.contentType,
              resultImageUrl: d.generation.resultImageUrl,
              prompt: d.generation.prompt,
              createdAt: d.generation.createdAt.toISOString(),
            }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const downloadService = new DownloadService();
