import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";
import type { ContentType } from "@prisma/client";

interface CreateFestivalInput {
  name: string;
  description?: string;
  date: Date;
  contentType: ContentType;
  visibilityDays?: number;
  metadata?: Record<string, unknown>;
  categoryIds?: string[];
  promotionConfig?: PromotionConfigItem[];
}

interface UpdateFestivalInput {
  name?: string;
  description?: string;
  date?: Date;
  contentType?: ContentType;
  visibilityDays?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  categoryIds?: string[];
  promotionConfig?: PromotionConfigItem[];
}

interface PromotionConfigItem {
  categoryId: string;
  sortOrder?: number;
  promotionStartDays?: number | null;
  promotionEndDays?: number;
}

interface ListQuery {
  page: number;
  limit: number;
  contentType?: ContentType;
  upcoming?: boolean;
}

const FESTIVAL_INCLUDE = {
  promotedCategories: {
    include: {
      category: {
        select: { id: true, name: true, slug: true, contentType: true },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
};

export class FestivalService {
  async list(query: ListQuery) {
    const { page, limit, contentType, upcoming } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (contentType) where.contentType = contentType;

    if (upcoming) {
      where.isActive = true;
      where.date = { gte: new Date() };
    }

    const [festivals, total] = await Promise.all([
      prisma.festivalCalendar.findMany({
        where,
        include: FESTIVAL_INCLUDE,
        orderBy: { date: "asc" },
        skip,
        take: limit,
      }),
      prisma.festivalCalendar.count({ where }),
    ]);

    return {
      data: festivals,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get festivals visible to users now — date is within visibility window.
   * Includes promoted categories for each festival.
   */
  async getVisible(contentType?: ContentType) {
    const now = new Date();

    const festivals = await prisma.festivalCalendar.findMany({
      where: {
        isActive: true,
        ...(contentType ? { contentType } : {}),
      },
      include: FESTIVAL_INCLUDE,
      orderBy: { date: "asc" },
    });

    // Filter: show festivals where (date - visibilityDays) <= now <= date + 1 day
    return festivals.filter((f) => {
      const visStart = new Date(f.date);
      visStart.setDate(visStart.getDate() - f.visibilityDays);
      const visEnd = new Date(f.date);
      visEnd.setDate(visEnd.getDate() + 1);
      return now >= visStart && now <= visEnd;
    });
  }

  /**
   * Get category IDs that should be promoted right now,
   * considering per-category promotion windows.
   * Returns a map of categoryId → { festivalName, sortOrder }
   */
  async getPromotedCategoryMap(contentType?: ContentType): Promise<
    Map<string, { festivalName: string; sortOrder: number }>
  > {
    const now = new Date();
    const result = new Map<string, { festivalName: string; sortOrder: number }>();

    const festivals = await prisma.festivalCalendar.findMany({
      where: {
        isActive: true,
        ...(contentType ? { contentType } : {}),
      },
      include: FESTIVAL_INCLUDE,
    });

    for (const festival of festivals) {
      const festDate = new Date(festival.date);

      for (const link of festival.promotedCategories) {
        // Determine promotion window for this specific category link
        const startDays = link.promotionStartDays ?? festival.visibilityDays;
        const endDays = link.promotionEndDays;

        const promoStart = new Date(festDate);
        promoStart.setDate(promoStart.getDate() - startDays);

        const promoEnd = new Date(festDate);
        promoEnd.setDate(promoEnd.getDate() + endDays);

        if (now >= promoStart && now <= promoEnd) {
          // If same category promoted by multiple festivals, keep lower sortOrder
          const existing = result.get(link.categoryId);
          if (!existing || link.sortOrder < existing.sortOrder) {
            result.set(link.categoryId, {
              festivalName: festival.name,
              sortOrder: link.sortOrder,
            });
          }
        }
      }
    }

    return result;
  }

  async getById(id: string) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
      include: FESTIVAL_INCLUDE,
    });
    if (!festival) throw new NotFoundError("Festival");
    return festival;
  }

  async create(input: CreateFestivalInput) {
    const festival = await prisma.festivalCalendar.create({
      data: {
        name: input.name,
        description: input.description,
        date: input.date,
        contentType: input.contentType,
        visibilityDays: input.visibilityDays ?? 7,
        metadata: (input.metadata as object) ?? {},
      },
      include: FESTIVAL_INCLUDE,
    });

    // Link categories if provided
    if (input.categoryIds?.length || input.promotionConfig?.length) {
      await this.syncCategories(festival.id, input.categoryIds, input.promotionConfig);
      return this.getById(festival.id);
    }

    return festival;
  }

  async update(id: string, input: UpdateFestivalInput) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
    });
    if (!festival) throw new NotFoundError("Festival");

    await prisma.festivalCalendar.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.date ? { date: new Date(input.date) } : {}),
        ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
        ...(input.visibilityDays !== undefined ? { visibilityDays: input.visibilityDays } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as object } : {}),
      },
    });

    // Sync categories if provided
    if (input.categoryIds !== undefined || input.promotionConfig !== undefined) {
      await this.syncCategories(id, input.categoryIds, input.promotionConfig);
    }

    return this.getById(id);
  }

  /**
   * Replace all festival-category links.
   * If promotionConfig is provided, use per-category settings.
   * Otherwise, use categoryIds with defaults.
   */
  async syncCategories(
    festivalId: string,
    categoryIds?: string[],
    promotionConfig?: PromotionConfigItem[]
  ) {
    // Delete existing links
    await prisma.festivalCategory.deleteMany({
      where: { festivalId },
    });

    // Build links from promotionConfig (if provided) or simple categoryIds
    const links: Array<{
      festivalId: string;
      categoryId: string;
      sortOrder: number;
      promotionStartDays: number | null;
      promotionEndDays: number;
    }> = [];

    if (promotionConfig?.length) {
      for (const cfg of promotionConfig) {
        links.push({
          festivalId,
          categoryId: cfg.categoryId,
          sortOrder: cfg.sortOrder ?? 0,
          promotionStartDays: cfg.promotionStartDays ?? null,
          promotionEndDays: cfg.promotionEndDays ?? 1,
        });
      }
    } else if (categoryIds?.length) {
      for (let i = 0; i < categoryIds.length; i++) {
        links.push({
          festivalId,
          categoryId: categoryIds[i],
          sortOrder: i,
          promotionStartDays: null,
          promotionEndDays: 1,
        });
      }
    }

    if (links.length > 0) {
      await prisma.festivalCategory.createMany({ data: links });
    }
  }

  async delete(id: string) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
    });
    if (!festival) throw new NotFoundError("Festival");
    // FestivalCategory links cascade-delete automatically
    await prisma.festivalCalendar.delete({ where: { id } });
  }
}

export const festivalService = new FestivalService();
