import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

interface JwtPayload {
  sub: string;
  role: UserRole;
  permissions?: string[];
  iat: number;
  exp: number;
}

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from Authorization header.
 * Sets req.userId and req.userRole on success.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing or invalid authorization header"));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.userPermissions = payload.permissions || [];
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired access token"));
  }
}

/**
 * Optional authentication — does not throw if no token present.
 * Sets req.userId/req.userRole if valid token found.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.userPermissions = payload.permissions || [];
  } catch {
    // Silently ignore invalid tokens in optional mode
  }

  next();
}

/**
 * RBAC guard middleware factory.
 * Must be used AFTER authenticate middleware.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      next(new UnauthorizedError());
      return;
    }

    if (!roles.includes(req.userRole)) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}

/**
 * Custom Role / Admin guard for backend API routes.
 * Ensures the user is either a native Admin OR possesses the exact string permission required.
 */
export function requireAdminAccess(permission?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      next(new UnauthorizedError());
      return;
    }

    // Admins and Super Admins bypass all specific checks
    if (req.userRole === "SUPER_ADMIN" || req.userRole === "ADMIN") {
      next();
      return;
    }

    // Custom roles logic
    const perms = req.userPermissions || [];
    if (perms.includes("ALL_ACCESS")) {
      next();
      return;
    }

    // Exact permission check
    if (permission && perms.includes(permission)) {
      next();
      return;
    }

    // If no explicit permission was given for this route, allow entry IF they have at least 1 permission
    // (Used as a fallback for the base /admin route itself)
    if (!permission && perms.length > 0) {
      next();
      return;
    }

    next(new ForbiddenError());
  };
}
