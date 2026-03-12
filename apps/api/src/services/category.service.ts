import { prisma } from "../config/database.js";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../utils/errors.js";
import type { ContentType, FieldType } from "@prisma/client";

interface CreateCategoryInput {
  name: string;
  slug: string;
  contentType: ContentType;
  description?: string;
  iconUrl?: string;
  parentId?: string;
}

interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  contentType?: ContentType;
  description?: string;
  iconUrl?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

interface CreateFieldSchemaInput {
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  isRequired?: boolean;
  sortOrder?: number;
  placeholder?: string;
  defaultValue?: string;
  hasPosition?: boolean;
  validation?: Record<string, unknown>;
  displayConfig?: Record<string, unknown>;
}

interface UpdateFieldSchemaInput {
  label?: string;
  fieldType?: FieldType;
  isRequired?: boolean;
  sortOrder?: number;
  placeholder?: string;
  defaultValue?: string;
  hasPosition?: boolean;
  validation?: Record<string, unknown>;
  displayConfig?: Record<string, unknown>;
}

interface ListQuery {
  page: number;
  limit: number;
  contentType?: ContentType;
  isActive?: boolean;
  parentId?: string | null; // filter by parent (null = top-level only)
  search?: string;
}

const CATEGORY_INCLUDE = {
  fieldSchemas: { orderBy: { sortOrder: "asc" as const } },
  children: {
    include: {
      fieldSchemas: { orderBy: { sortOrder: "asc" as const } },
      _count: { select: { templates: true, children: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  parent: { select: { id: true, name: true, slug: true } },
  _count: { select: { templates: true, children: true } },
};

export class CategoryService {
  async list(query: ListQuery) {
    const { page, limit, contentType, isActive, parentId, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (contentType) where.contentType = contentType;
    if (isActive !== undefined) where.isActive = isActive;
    // parentId filter: undefined = top-level only (children loaded via include),
    // null = explicitly top-level only, string = specific parent
    if (parentId !== undefined) {
      where.parentId = parentId;
    } else {
      // Default: only top-level categories (sub-categories loaded via CATEGORY_INCLUDE.children)
      where.parentId = null;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        include: CATEGORY_INCLUDE,
        orderBy: { sortOrder: "asc" },
        skip,
        take: limit,
      }),
      prisma.category.count({ where }),
    ]);

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: CATEGORY_INCLUDE,
    });

    if (!category) throw new NotFoundError("Category");
    return category;
  }

  async getBySlug(slug: string) {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: CATEGORY_INCLUDE,
    });

    if (!category) throw new NotFoundError("Category");
    return category;
  }

  async create(input: CreateCategoryInput) {
    const existing = await prisma.category.findUnique({
      where: { slug: input.slug },
    });
    if (existing) throw new ConflictError("Category slug already exists");

    // Validate parent exists if parentId provided
    if (input.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
      if (!parent) throw new NotFoundError("Parent category");
      // Subcategory inherits contentType from parent
      input.contentType = parent.contentType;
    }

    return prisma.category.create({
      data: input as any,
      include: CATEGORY_INCLUDE,
    });
  }

  async update(id: string, input: UpdateCategoryInput) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundError("Category");

    if (input.slug && input.slug !== category.slug) {
      const existing = await prisma.category.findUnique({
        where: { slug: input.slug },
      });
      if (existing) throw new ConflictError("Category slug already exists");
    }

    // Prevent circular parent references
    if (input.parentId) {
      if (input.parentId === id) {
        throw new BadRequestError("Category cannot be its own parent");
      }
      // Check the target parent isn't a descendant of this category
      const isDescendant = await this.isDescendantOf(input.parentId, id);
      if (isDescendant) {
        throw new BadRequestError("Cannot set a descendant as parent (circular reference)");
      }
    }

    return prisma.category.update({
      where: { id },
      data: input as any,
      include: CATEGORY_INCLUDE,
    });
  }

  async delete(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { templates: true, children: true } } },
    });
    if (!category) throw new NotFoundError("Category");

    if (category._count.templates > 0) {
      throw new BadRequestError(
        `Cannot delete category with ${category._count.templates} templates. Deactivate it instead.`
      );
    }

    if (category._count.children > 0) {
      throw new BadRequestError(
        `Cannot delete category with ${category._count.children} sub-categories. Remove or move them first.`
      );
    }

    await prisma.category.delete({ where: { id } });
  }

  /** Check if targetId is a descendant of ancestorId (prevents circular references) */
  private async isDescendantOf(targetId: string, ancestorId: string): Promise<boolean> {
    let current = await prisma.category.findUnique({
      where: { id: targetId },
      select: { parentId: true },
    });
    const visited = new Set<string>();
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      if (visited.has(current.parentId)) return false; // safety: break cycle
      visited.add(current.parentId);
      current = await prisma.category.findUnique({
        where: { id: current.parentId },
        select: { parentId: true },
      });
    }
    return false;
  }

  // ─── Field Schema Management ───────────────────────────

  async addField(categoryId: string, input: CreateFieldSchemaInput) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundError("Category");

    const existing = await prisma.fieldSchema.findUnique({
      where: {
        categoryId_fieldKey: {
          categoryId,
          fieldKey: input.fieldKey,
        },
      },
    });
    if (existing) {
      throw new ConflictError(
        `Field key "${input.fieldKey}" already exists in this category`
      );
    }

    return prisma.fieldSchema.create({
      data: {
        categoryId,
        fieldKey: input.fieldKey,
        label: input.label,
        fieldType: input.fieldType,
        isRequired: input.isRequired ?? false,
        sortOrder: input.sortOrder ?? 0,
        placeholder: input.placeholder,
        defaultValue: input.defaultValue,
        hasPosition: input.hasPosition ?? false,
        validation: input.validation ?? undefined,
        displayConfig: input.displayConfig ?? undefined,
      },
    });
  }

  async updateField(fieldId: string, input: UpdateFieldSchemaInput) {
    const field = await prisma.fieldSchema.findUnique({
      where: { id: fieldId },
    });
    if (!field) throw new NotFoundError("Field schema");

    return prisma.fieldSchema.update({
      where: { id: fieldId },
      data: {
        ...input,
        validation: input.validation ?? undefined,
        displayConfig: input.displayConfig ?? undefined,
      },
    });
  }

  async deleteField(fieldId: string) {
    const field = await prisma.fieldSchema.findUnique({
      where: { id: fieldId },
    });
    if (!field) throw new NotFoundError("Field schema");

    await prisma.fieldSchema.delete({ where: { id: fieldId } });
  }

  async reorderFields(
    categoryId: string,
    fieldOrders: Array<{ id: string; sortOrder: number }>
  ) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundError("Category");

    await prisma.$transaction(
      fieldOrders.map((f) =>
        prisma.fieldSchema.update({
          where: { id: f.id },
          data: { sortOrder: f.sortOrder },
        })
      )
    );

    return prisma.fieldSchema.findMany({
      where: { categoryId },
      orderBy: { sortOrder: "asc" },
    });
  }
}

export const categoryService = new CategoryService();
