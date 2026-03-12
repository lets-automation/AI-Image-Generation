import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../../utils/errors.js";

class UserController {
  /** List all users with pagination + optional role/search filter */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        role?: string;
        search?: string;
      };

      const where: Record<string, unknown> = { deletedAt: null };
      if (query.role) {
        if (["USER", "ADMIN", "SUPER_ADMIN"].includes(query.role)) {
          where.role = query.role;
        } else {
          where.customRoleId = query.role;
        }
      }
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: where as any,
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            customRoleId: true,
            isActive: true,
            canGenerate: true,
            avatarUrl: true,
            lastLoginAt: true,
            createdAt: true,
            _count: { select: { generations: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.user.count({ where: where as any }),
      ]);

      res.json({
        success: true,
        data: users,
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Update a user's role */
  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const { role } = req.body as { role: string };
      const actingUserId = (req as any).userId;
      const actingRole = (req as any).userRole;

      // Cannot change your own role
      if (id === actingUserId) {
        throw new ForbiddenError("You cannot change your own role");
      }

      // Only SUPER_ADMIN can assign SUPER_ADMIN or demote SUPER_ADMIN
      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser || targetUser.deletedAt) {
        throw new NotFoundError("User");
      }

      if (
        (role === "SUPER_ADMIN" || targetUser.role === "SUPER_ADMIN") &&
        actingRole !== "SUPER_ADMIN"
      ) {
        throw new ForbiddenError("Only SUPER_ADMIN can assign or revoke SUPER_ADMIN role");
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role: role as any },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /** Toggle user active status (deactivate/reactivate) */
  async toggleActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const actingUserId = (req as any).userId;
      const actingRole = (req as any).userRole;

      if (id === actingUserId) {
        throw new ForbiddenError("You cannot deactivate your own account");
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.deletedAt) {
        throw new NotFoundError("User");
      }

      // Only SUPER_ADMIN can deactivate/reactivate another SUPER_ADMIN
      if (user.role === "SUPER_ADMIN" && actingRole !== "SUPER_ADMIN") {
        throw new ForbiddenError("Only SUPER_ADMIN can deactivate or reactivate a SUPER_ADMIN account");
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /** Toggle user generation access */
  async toggleGenerationAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const actingUserId = (req as any).userId;
      
      if (id === actingUserId) {
        throw new ForbiddenError("You cannot change your own generation access");
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.deletedAt) {
        throw new NotFoundError("User");
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { canGenerate: !user.canGenerate },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          canGenerate: true,
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /** Create an admin account (only SUPER_ADMIN can do this) */
  async createAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, phone, role } = req.body as {
        email: string;
        password: string;
        name: string;
        phone?: string;
        role: string;
      };

      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictError(
          existing.email === email
            ? "Email already registered"
            : "Phone number already registered"
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone,
          role: role as any,
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
