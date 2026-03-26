import { prisma } from "../config/database.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { auditService } from "./audit.service.js";

interface ListShowcaseQuery {
  page: number;
  limit: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  contentType?: "EVENT" | "POSTER";
}

interface ReviewShowcaseInput {
  generationId: string;
  adminUserId: string;
  decision: "APPROVED" | "REJECTED";
  rejectionReason?: string;
  categoryId?: string; // Admin can override category
  targetCountries?: string[]; // Admin can override target countries
}

export class ShowcaseService {
  /**
   * List showcase requests for admin review.
   * Only shows COMPLETED generations that have a showcase request.
   */
  async listRequests(query: ListShowcaseQuery) {
    const { page, limit, status, contentType } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      showcaseStatus: status || { not: "NONE" },
      status: "COMPLETED", // Only show completed generations
    };
    if (contentType) where.contentType = contentType;

    const [generations, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, country: true } as any },
          template: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              category: { select: { id: true, name: true } },
            },
          },
          showcaseCategory: { select: { id: true, name: true } },
        } as any,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generation.count({ where }),
    ]);

    return {
      data: generations.map((g: any) => this.formatShowcaseRequest(g)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single showcase request for admin review.
   */
  async getRequest(generationId: string) {
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: {
        user: { select: { id: true, name: true, email: true, country: true } as any },
        template: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
        showcaseCategory: { select: { id: true, name: true } },
      } as any,
    });

    if (!generation) throw new NotFoundError("Generation");
    if ((generation as any).showcaseStatus === "NONE") {
      throw new BadRequestError("This generation has no showcase request");
    }

    return this.formatShowcaseRequest(generation as any);
  }

  /**
   * Admin reviews a showcase request — approve or reject.
   */
  async review(input: ReviewShowcaseInput) {
    const { generationId, adminUserId, decision, rejectionReason, categoryId, targetCountries } = input;

    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      select: {
        id: true,
        showcaseStatus: true,
        status: true,
        language: true,
      } as any,
    });

    if (!generation) throw new NotFoundError("Generation");

    const genData = generation as any;
    if (genData.status !== "COMPLETED") {
      throw new BadRequestError("Only completed generations can be reviewed");
    }

    if (genData.showcaseStatus !== "PENDING") {
      throw new BadRequestError(
        `Cannot review: current status is "${genData.showcaseStatus}", expected "PENDING"`
      );
    }

    // Validate category if provided
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundError("Category");
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      showcaseStatus: decision,
      showcaseReviewedBy: adminUserId,
      showcaseReviewedAt: new Date(),
    };

    if (decision === "REJECTED") {
      updateData.showcaseRejectionReason = rejectionReason || "No reason provided";
      updateData.isPublic = false; // Ensure rejected items aren't public
    } else {
      // APPROVED
      updateData.isPublic = true;
      updateData.showcaseRejectionReason = null;
    }

    if (categoryId !== undefined) {
      updateData.showcaseCategoryId = categoryId;
    }

    if (targetCountries !== undefined) {
      updateData.showcaseTargetCountries = targetCountries;
    }

    const updated = await prisma.generation.update({
      where: { id: generationId },
      data: updateData as any,
      include: {
        user: { select: { id: true, name: true, email: true, country: true } as any },
        template: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
        showcaseCategory: { select: { id: true, name: true } },
      } as any,
    });

    // Audit log
    auditService.log({
      userId: adminUserId,
      action: `showcase.${decision.toLowerCase()}`,
      entity: "generation",
      entityId: generationId,
      changes: {
        decision,
        rejectionReason: rejectionReason ?? null,
        categoryOverride: categoryId ?? null,
        targetCountries: targetCountries ?? null,
      },
    });

    logger.info(
      { generationId, adminUserId, decision },
      `Showcase request ${decision.toLowerCase()}`
    );

    return this.formatShowcaseRequest(updated as any);
  }

  /**
   * Get showcase counts for admin dashboard.
   */
  async getCounts() {
    const [pending, approved, rejected] = await Promise.all([
      prisma.generation.count({ where: { showcaseStatus: "PENDING", status: "COMPLETED" } as any }),
      prisma.generation.count({ where: { showcaseStatus: "APPROVED" } as any }),
      prisma.generation.count({ where: { showcaseStatus: "REJECTED" } as any }),
    ]);

    return { pending, approved, rejected, total: pending + approved + rejected };
  }

  // ─── Private ─────────────────────────────────────────────

  private formatShowcaseRequest(g: any) {
    return {
      id: g.id,
      userId: g.userId,
      userName: g.user?.name ?? "Unknown",
      userEmail: g.user?.email ?? "",
      userCountry: g.user?.country ?? null,
      resultImageUrl: g.resultImageUrl ?? null,
      contentType: g.contentType,
      language: g.language,
      qualityTier: g.qualityTier,
      categoryName: g.template?.category?.name ?? "Custom Upload",
      categoryId: g.template?.categoryId ?? null,
      showcaseStatus: g.showcaseStatus,
      showcaseCategoryId: g.showcaseCategoryId ?? null,
      showcaseCategoryName: g.showcaseCategory?.name ?? null,
      showcaseTargetCountries: g.showcaseTargetCountries ?? null,
      showcaseRejectionReason: g.showcaseRejectionReason ?? null,
      showcaseReviewedAt: g.showcaseReviewedAt
        ? g.showcaseReviewedAt instanceof Date
          ? g.showcaseReviewedAt.toISOString()
          : g.showcaseReviewedAt
        : null,
      createdAt: g.createdAt instanceof Date
        ? g.createdAt.toISOString()
        : g.createdAt,
    };
  }
}

export const showcaseService = new ShowcaseService();
