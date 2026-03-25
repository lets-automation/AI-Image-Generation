import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validation.js";
import { authenticate } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "@ep/shared";

const router = Router();

router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  authController.register.bind(authController)
);

router.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  authController.login.bind(authController)
);

router.post(
  "/google",
  authLimiter,
  authController.googleLogin.bind(authController)
);

router.post(
  "/refresh",
  authLimiter,
  validate({ body: refreshTokenSchema }),
  authController.refresh.bind(authController)
);

router.post(
  "/logout",
  authenticate,
  validate({ body: refreshTokenSchema }),
  authController.logout.bind(authController)
);

router.get(
  "/me",
  authenticate,
  authController.me.bind(authController)
);

export { router as authRoutes };
