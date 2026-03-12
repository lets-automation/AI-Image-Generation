import { prisma } from "../config/database.js";
import { logger } from "../utils/logger.js";

/**
 * Audit Log Service
 *
 * Records user and admin actions for compliance and debugging.
 * All writes are fire-and-forget (non-blocking, non-critical).
 */

export interface AuditEntry {
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditService {
  /**
   * Record an audit log entry.
   * Non-blocking — errors are logged but never thrown.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          changes: entry.changes as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      logger.warn({ err, entry }, "Failed to write audit log — non-critical");
    }
  }

  /**
   * Log a generation creation.
   */
  async logGeneration(
    userId: string,
    generationId: string,
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: "generation.create",
      entity: "Generation",
      entityId: generationId,
      changes: details,
      ipAddress,
    });
  }

  /**
   * Log a moderation block.
   */
  async logModerationBlock(
    userId: string,
    category: string,
    matchedPattern: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: "moderation.block",
      entity: "Prompt",
      entityId: userId,
      changes: { category, matchedPattern },
      ipAddress,
    });
  }

  /**
   * Log an admin action.
   */
  async logAdminAction(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    changes?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: `admin.${action}`,
      entity,
      entityId,
      changes,
      ipAddress,
    });
  }

  /**
   * Log a subscription event.
   */
  async logSubscriptionAction(
    userId: string,
    action: string,
    subscriptionId: string,
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: `subscription.${action}`,
      entity: "Subscription",
      entityId: subscriptionId,
      changes: details,
      ipAddress,
    });
  }

  /**
   * Query audit logs with filters (admin use).
   */
  async query(filters: {
    userId?: string;
    entity?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, entity, action, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = { contains: action };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const auditService = new AuditService();
