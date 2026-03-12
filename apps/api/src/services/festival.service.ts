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
}

interface UpdateFestivalInput {
  name?: string;
  description?: string;
  date?: Date;
  contentType?: ContentType;
  visibilityDays?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

interface ListQuery {
  page: number;
  limit: number;
  contentType?: ContentType;
  upcoming?: boolean;
}

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
   */
  async getVisible(contentType?: ContentType) {
    const now = new Date();

    const festivals = await prisma.festivalCalendar.findMany({
      where: {
        isActive: true,
        ...(contentType ? { contentType } : {}),
      },
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

  async getById(id: string) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
    });
    if (!festival) throw new NotFoundError("Festival");
    return festival;
  }

  async create(input: CreateFestivalInput) {
    return prisma.festivalCalendar.create({
      data: {
        name: input.name,
        description: input.description,
        date: input.date,
        contentType: input.contentType,
        visibilityDays: input.visibilityDays ?? 7,
        metadata: (input.metadata as object) ?? {},
      },
    });
  }

  async update(id: string, input: UpdateFestivalInput) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
    });
    if (!festival) throw new NotFoundError("Festival");

    return prisma.festivalCalendar.update({
      where: { id },
      data: {
        ...input,
        date: input.date ? new Date(input.date) : undefined,
        metadata: input.metadata !== undefined ? (input.metadata as object) : undefined,
      },
    });
  }

  async delete(id: string) {
    const festival = await prisma.festivalCalendar.findUnique({
      where: { id },
    });
    if (!festival) throw new NotFoundError("Festival");
    await prisma.festivalCalendar.delete({ where: { id } });
  }
}

export const festivalService = new FestivalService();
