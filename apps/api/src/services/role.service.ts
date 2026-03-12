import { prisma } from "../config/database.js";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../utils/errors.js";
import { ALL_PERMISSIONS } from "@ep/shared";

interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

export class RoleService {
  async list() {
    return prisma.customRole.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    });
  }

  async getById(id: string) {
    const role = await prisma.customRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundError("Custom role");
    return role;
  }

  async create(input: CreateRoleInput) {
    // Validate permission codes
    const invalid = input.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
    if (invalid.length > 0) {
      throw new BadRequestError(`Invalid permissions: ${invalid.join(", ")}`);
    }

    const existing = await prisma.customRole.findUnique({ where: { name: input.name } });
    if (existing) throw new ConflictError("Role name already exists");

    return prisma.customRole.create({
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissions,
      },
      include: { _count: { select: { users: true } } },
    });
  }

  async update(id: string, input: UpdateRoleInput) {
    const role = await prisma.customRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Custom role");
    if (role.isSystem) throw new BadRequestError("System roles cannot be modified");

    if (input.permissions) {
      const invalid = input.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
      if (invalid.length > 0) {
        throw new BadRequestError(`Invalid permissions: ${invalid.join(", ")}`);
      }
    }

    if (input.name && input.name !== role.name) {
      const existing = await prisma.customRole.findUnique({ where: { name: input.name } });
      if (existing) throw new ConflictError("Role name already exists");
    }

    return prisma.customRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.permissions !== undefined && { permissions: input.permissions }),
      },
      include: { _count: { select: { users: true } } },
    });
  }

  async delete(id: string) {
    const role = await prisma.customRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundError("Custom role");
    if (role.isSystem) throw new BadRequestError("System roles cannot be deleted");
    if (role._count.users > 0) {
      throw new BadRequestError(
        `Cannot delete role with ${role._count.users} assigned users. Reassign them first.`
      );
    }

    await prisma.customRole.delete({ where: { id } });
  }

  /** Assign a custom role to a user */
  async assignToUser(userId: string, roleId: string | null) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");

    if (roleId) {
      const role = await prisma.customRole.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundError("Custom role");
    }

    return prisma.user.update({
      where: { id: userId },
      data: { customRoleId: roleId },
    });
  }
}

export const roleService = new RoleService();
