import { prisma } from "../config/database.js";
import { cloudinary } from "../config/cloudinary.js";
import {
  NotFoundError,
  BadRequestError,
} from "../utils/errors.js";
import type { ContentType } from "@prisma/client";
import sharp from "sharp";

interface CreateTemplateInput {
  name: string;
  contentType: ContentType;
  categoryId: string;
  safeZones?: unknown[];
  metadata?: Record<string, unknown>;
}

interface UpdateTemplateInput {
  name?: string;
  contentType?: ContentType;
  categoryId?: string;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

interface SafeZone {
  id: string;
  type: "text" | "logo" | "both";
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  maxFontSize?: number;
  position: string;
}

interface ListQuery {
  page: number;
  limit: number;
  contentType?: ContentType;
  categoryId?: string;
  isActive?: boolean;
  aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
  search?: string;
}

export class TemplateService {
  async list(query: ListQuery) {
    const { page, limit, contentType, categoryId, isActive, aspectRatio, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (contentType) where.contentType = contentType;
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { category: { name: { contains: search, mode: "insensitive" } } }
      ];
    }

    let templates = await prisma.template.findMany({
      where,
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { sortOrder: "asc" },
    });

    if (aspectRatio) {
      templates = templates.filter((t) => {
        if (aspectRatio === "SQUARE") return t.width === t.height;
        if (aspectRatio === "PORTRAIT") return t.height > t.width;
        if (aspectRatio === "LANDSCAPE") return t.width > t.height;
        return true;
      });
    }

    const total = templates.length;
    const paginatedTemplates = templates.slice(skip, skip + limit);

    return {
      data: paginatedTemplates,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listGroupedByCategory(query: { contentType: ContentType; aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE" }) {
    const { contentType, aspectRatio } = query;

    // Fetch all active categories for this content type with their active templates
    const categories = await prisma.category.findMany({
      where: { contentType, isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        templates: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: "asc" },
          include: { category: { select: { id: true, name: true, slug: true } } }
        }
      }
    });

    // Filter templates by aspect ratio and limit to 10 per category
    const grouped = categories.map((category) => {
      let filteredTemplates = category.templates;
      if (aspectRatio) {
        filteredTemplates = filteredTemplates.filter((t) => {
          if (aspectRatio === "SQUARE") return t.width === t.height;
          if (aspectRatio === "PORTRAIT") return t.height > t.width;
          if (aspectRatio === "LANDSCAPE") return t.width > t.height;
          return true;
        });
      }
      return {
        ...category,
        templates: filteredTemplates.slice(0, 10),
      };
    }).filter((category) => category.templates.length > 0);

    return grouped;
  }

  async getById(id: string) {
    const template = await prisma.template.findUnique({
      where: { id },
      include: {
        category: {
          include: { fieldSchemas: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!template || template.deletedAt) throw new NotFoundError("Template");
    return template;
  }

  async create(input: CreateTemplateInput, imageBuffer: Buffer) {
    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) throw new NotFoundError("Category");

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new BadRequestError("Could not read image dimensions");
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `ep-product/templates/${input.contentType.toLowerCase()}`,
          resource_type: "image",
          transformation: [{ quality: "auto:best", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) reject(error || new Error("Upload failed"));
          else resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(imageBuffer);
    });

    return prisma.template.create({
      data: {
        name: input.name,
        contentType: input.contentType,
        categoryId: input.categoryId,
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        width: metadata.width,
        height: metadata.height,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        safeZones: (input.safeZones ?? []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: (input.metadata ?? null) as any,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  async update(id: string, input: UpdateTemplateInput) {
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.deletedAt) throw new NotFoundError("Template");

    if (input.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) throw new NotFoundError("Category");
    }

    return prisma.template.update({
      where: { id },
      data: {
        ...input,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: input.metadata !== undefined ? (input.metadata as any) : undefined,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  async updateSafeZones(id: string, safeZones: SafeZone[]) {
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.deletedAt) throw new NotFoundError("Template");

    // Save current safe zones to layout history before overwriting
    await prisma.templateLayoutHistory.create({
      data: {
        templateId: id,
        version: template.layoutVersion,
        safeZones: template.safeZones,
      },
    });

    // Update template with new safe zones + increment version
    return prisma.template.update({
      where: { id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        safeZones: safeZones as any,
        layoutVersion: { increment: 1 },
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  async delete(id: string) {
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.deletedAt) throw new NotFoundError("Template");

    // Soft delete
    await prisma.template.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    // Clean up Cloudinary asset (best effort)
    try {
      await cloudinary.uploader.destroy(template.publicId);
    } catch {
      // Log but don't fail — asset may already be gone
    }
  }

  async replaceImage(id: string, imageBuffer: Buffer) {
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.deletedAt) throw new NotFoundError("Template");

    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new BadRequestError("Could not read image dimensions");
    }

    // Delete old image
    try {
      await cloudinary.uploader.destroy(template.publicId);
    } catch {
      // best effort
    }

    // Upload new image
    const uploadResult = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `ep-product/templates/${template.contentType.toLowerCase()}`,
          resource_type: "image",
          transformation: [{ quality: "auto:best", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) reject(error || new Error("Upload failed"));
          else resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(imageBuffer);
    });

    return prisma.template.update({
      where: { id },
      data: {
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        width: metadata.width,
        height: metadata.height,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }
}

export const templateService = new TemplateService();
