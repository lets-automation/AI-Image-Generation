import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";

export class AuthController {
  async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const xForwardedFor = req.headers["x-forwarded-for"] as string;
      const xRealIp = req.headers["x-real-ip"] as string;
      const ipAddress = xForwardedFor?.split(",")[0]?.trim() || xRealIp?.trim() || req.ip;
      
      const forcedCountry = (req.headers["cf-ipcountry"] as string) || (req.headers["x-vercel-ip-country"] as string);
      console.log("[REGISTER] Extracting IP:", { xForwardedFor, xRealIp, reqIp: req.ip, finalIp: ipAddress, forcedCountry });
      
      const result = await authService.register({ ...req.body, ipAddress, forcedCountry });
      res.status(201).json({
        success: true,
        data: {
          user: {
            ...result.user,
            createdAt: result.user.createdAt.toISOString(),
          },
          tokens: result.tokens,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const xForwardedFor = req.headers["x-forwarded-for"] as string;
      const xRealIp = req.headers["x-real-ip"] as string;
      const ipAddress = xForwardedFor?.split(",")[0]?.trim() || xRealIp?.trim() || req.ip;
      
      const forcedCountry = (req.headers["cf-ipcountry"] as string) || (req.headers["x-vercel-ip-country"] as string);
      console.log("[LOGIN] Extracting IP:", { xForwardedFor, xRealIp, reqIp: req.ip, finalIp: ipAddress, forcedCountry });
      
      const result = await authService.login({ ...req.body, ipAddress, forcedCountry });
      res.json({
        success: true,
        data: {
          user: {
            ...result.user,
            createdAt: result.user.createdAt.toISOString(),
          },
          tokens: result.tokens,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async googleLogin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { credential } = req.body as { credential?: string };
      if (!credential) {
        res.status(400).json({
          success: false,
          error: { message: "Google credential is required" },
        });
        return;
      }

      const xForwardedFor = req.headers["x-forwarded-for"] as string;
      const xRealIp = req.headers["x-real-ip"] as string;
      const ipAddress = xForwardedFor?.split(",")[0]?.trim() || xRealIp?.trim() || req.ip;
      
      const forcedCountry = (req.headers["cf-ipcountry"] as string) || (req.headers["x-vercel-ip-country"] as string);
      console.log("[GOOGLE_LOGIN] Extracting IP:", { xForwardedFor, xRealIp, reqIp: req.ip, finalIp: ipAddress, forcedCountry });

      const result = await authService.googleLogin(credential, ipAddress, forcedCountry);
      res.json({
        success: true,
        data: {
          user: {
            ...result.user,
            createdAt: result.user.createdAt.toISOString(),
          },
          tokens: result.tokens,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshToken(refreshToken);
      res.json({
        success: true,
        data: { tokens },
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async me(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = await authService.getUserProfile(req.userId!);
      res.json({
        success: true,
        data: {
          ...user,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
