import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from "../utils/errors.js";
type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    role: UserRole;
    customRole?: { name: string; permissions: string[] } | null;
    avatarUrl: string | null;
    canGenerate: boolean;
    createdAt: Date;
  };
  tokens: TokenPair;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  async register(input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }): Promise<AuthResult> {
    // Check for existing user
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          ...(input.phone ? [{ phone: input.phone }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictError("An account with this information already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, this.SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
      },
    });

    const tokens = await this.generateTokens(user.id, user.role, []);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        customRole: null, // New users don't have custom roles yet
        avatarUrl: user.avatarUrl,
        canGenerate: user.role === "SUPER_ADMIN" ? true : user.canGenerate,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { customRole: { select: { name: true, permissions: true } } }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Account has been deactivated");
    }

    const validPassword = await bcrypt.compare(
      input.password,
      user.passwordHash
    );

    if (!validPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.role, user.customRole?.permissions || []);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        customRole: user.customRole,
        avatarUrl: user.avatarUrl,
        canGenerate: user.role === "SUPER_ADMIN" ? true : user.canGenerate,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedError("Account is no longer active");
    }

    // Revoke old token (rotation)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    
    // We need permissions for the new JWT
    const userPermissions = await prisma.user.findUnique({
      where: { id: stored.userId },
      include: { customRole: { select: { permissions: true } } }
    });

    return this.generateTokens(stored.userId, stored.user.role, userPermissions?.customRole?.permissions || []);
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { customRole: { select: { name: true, permissions: true } } }
    });

    if (!user || user.deletedAt) {
      throw new NotFoundError("User");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      customRole: user.customRole,
      avatarUrl: user.avatarUrl,
      canGenerate: user.role === "SUPER_ADMIN" ? true : user.canGenerate,
      createdAt: user.createdAt,
    };
  }

  private async generateTokens(
    userId: string,
    role: UserRole,
    permissions: string[]
  ): Promise<TokenPair> {
    const expiresInMs = this.parseExpiry(config.JWT_ACCESS_EXPIRY);
    const accessToken = jwt.sign(
      { sub: userId, role, permissions },
      config.JWT_ACCESS_SECRET,
      { expiresIn: Math.floor(expiresInMs / 1000) }
    );

    const refreshTokenValue = uuidv4();

    // Parse refresh expiry to milliseconds
    const refreshExpiryMs = this.parseExpiry(config.JWT_REFRESH_EXPIRY);

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId,
        expiresAt: new Date(Date.now() + refreshExpiryMs),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}

export const authService = new AuthService();
