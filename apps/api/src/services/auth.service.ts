import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
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
    country: string | null;
    canGenerate: boolean;
    createdAt: Date;
  };
  tokens: TokenPair;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  /**
   * Register with email/password. Restricted to admin account creation only.
   * Regular users must sign up via Google OAuth.
   */
  async register(input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    country?: string;
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
    const country = this.normalizeCountry(input.country);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        country,
      } as any,
    });

    const tokens = await this.generateTokens(user.id, user.role, []);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        customRole: null,
        avatarUrl: user.avatarUrl,
        country: (user as any).country ?? null,
        canGenerate: user.role === "SUPER_ADMIN" ? true : user.canGenerate,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async login(input: {
    email: string;
    password: string;
    country?: string;
  }): Promise<AuthResult> {
    let user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { customRole: { select: { name: true, permissions: true } } }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Account has been deactivated");
    }

    // Only admin/super_admin can use email/password login
    if (user.role === "USER") {
      throw new ForbiddenError("Please use Google Sign-In to log in");
    }

    const validPassword = await bcrypt.compare(
      input.password,
      user.passwordHash
    );

    if (!validPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const normalizedCountry = this.normalizeCountry(input.country);
    const needsCountryUpdate = normalizedCountry && !(user as any).country;

    // Update last login and potentially country
    if (needsCountryUpdate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), country: normalizedCountry } as any,
        include: { customRole: { select: { name: true, permissions: true } } }
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

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
        country: (user as any).country ?? null,
        canGenerate: user.role === "SUPER_ADMIN" ? true : user.canGenerate,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  /**
   * Authenticate via Google OAuth. Verifies the Google ID token,
   * finds or creates the user, and issues JWT tokens.
   */
  async googleLogin(credential: string, country?: string): Promise<AuthResult> {
    // 1. Verify token with Google
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!res.ok) {
      throw new UnauthorizedError("Invalid Google token");
    }

    const payload = (await res.json()) as {
      aud: string; sub: string; email?: string; name?: string; picture?: string;
    };

    // 2. Validate audience matches our client ID
    if (payload.aud !== config.GOOGLE_CLIENT_ID) {
      logger.warn({ aud: payload.aud }, "Google token audience mismatch");
      throw new UnauthorizedError("Invalid Google token");
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    if (!email) {
      throw new BadRequestError("Email is required for Google sign-in");
    }

    // 3. Find or create user
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId } as any, { email }] },
      include: { customRole: { select: { name: true, permissions: true } } },
    });

    const newCountry = this.normalizeCountry(country);

    if (user && !(user as any).googleId) {
      // Link Google account to existing email user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          avatarUrl: user.avatarUrl || picture || null,
          emailVerified: true,
          country: (user as any).country || newCountry,
        } as any,
        include: { customRole: { select: { name: true, permissions: true } } },
      });
      logger.info({ userId: user.id, email }, "Google account linked to existing user");
    } else if (!user) {
      // Create new user with a random unusable password hash
      const randomHash = await bcrypt.hash(uuidv4(), this.SALT_ROUNDS);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: randomHash,
          name: name || email.split("@")[0],
          googleId,
          avatarUrl: picture || null,
          emailVerified: true,
          canGenerate: true,
          country: newCountry,
        } as any,
        include: { customRole: { select: { name: true, permissions: true } } },
      });
      logger.info({ userId: user.id, email, country: newCountry }, "New user created via Google OAuth");
    } else if (newCountry && !(user as any).country) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { country: newCountry } as any,
        include: { customRole: { select: { name: true, permissions: true } } },
      });
    }

    if (user!.deletedAt || !user!.isActive) {
      throw new UnauthorizedError("Account has been deactivated");
    }

    // 4. Update last login
    await prisma.user.update({
      where: { id: user!.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user!.id, user!.role, (user as any)!.customRole?.permissions || []);

    return {
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        phone: user!.phone,
        role: user!.role,
        customRole: (user as any)!.customRole,
        avatarUrl: user!.avatarUrl,
        country: (user as any)!.country ?? null,
        canGenerate: user!.role === "SUPER_ADMIN" ? true : user!.canGenerate,
        createdAt: user!.createdAt,
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
      country: (user as any).country ?? null,
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

  /**
   * Update user's country (called when user sets country from frontend).
   */
  async updateCountry(userId: string, country: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { country } as any,
    });
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

  private normalizeCountry(country?: string | null): string | null {
    if (!country) return null;
    const normalized = country.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
  }
}

export const authService = new AuthService();
