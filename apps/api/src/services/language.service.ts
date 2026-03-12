/**
 * Language Service — CRUD for system languages
 */
import { prisma } from "../config/database.js";
import { BadRequestError, NotFoundError, ConflictError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export class LanguageService {
  /** List all active languages, ordered by sortOrder */
  async listActive() {
    return prisma.systemLanguage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** List ALL languages (admin) */
  async listAll() {
    return prisma.systemLanguage.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  /** Create a new language */
  async create(input: {
    code: string;
    label: string;
    nativeLabel: string;
    script?: string;
    fontFamily?: string;
    direction?: string;
  }) {
    const code = input.code.toUpperCase().replace(/\s+/g, "_");

    // Check for duplicate code
    const existing = await prisma.systemLanguage.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictError(`Language with code "${code}" already exists`);
    }

    // Get next sortOrder
    const last = await prisma.systemLanguage.findFirst({ orderBy: { sortOrder: "desc" } });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    const lang = await prisma.systemLanguage.create({
      data: {
        code,
        label: input.label,
        nativeLabel: input.nativeLabel,
        script: input.script ?? "Latin",
        fontFamily: input.fontFamily ?? "Noto Sans",
        direction: input.direction ?? "ltr",
        sortOrder,
      },
    });

    logger.info({ code: lang.code, id: lang.id }, "System language created");
    return lang;
  }

  /** Update a language */
  async update(id: string, input: Partial<{
    label: string;
    nativeLabel: string;
    script: string;
    fontFamily: string;
    direction: string;
    isActive: boolean;
    sortOrder: number;
  }>) {
    const existing = await prisma.systemLanguage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Language");

    return prisma.systemLanguage.update({
      where: { id },
      data: input,
    });
  }

  /** Delete a language */
  async delete(id: string) {
    const existing = await prisma.systemLanguage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Language");

    // Check if any generations use this language
    const usageCount = await prisma.generation.count({
      where: { language: existing.code },
    });

    if (usageCount > 0) {
      throw new BadRequestError(
        `Cannot delete language "${existing.label}" — it is used in ${usageCount} generation(s). Deactivate it instead.`
      );
    }

    await prisma.systemLanguage.delete({ where: { id } });
    logger.info({ code: existing.code }, "System language deleted");
  }
}

export const languageService = new LanguageService();
