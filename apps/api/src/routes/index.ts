import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { categoryRoutes } from "./category.routes.js";
import { templateRoutes } from "./template.routes.js";
import { festivalRoutes } from "./festival.routes.js";
import { generationRoutes } from "./generation.routes.js";
import { downloadRoutes } from "./download.routes.js";
import { userRoutes } from "./user.routes.js";
import { subscriptionRoutes } from "./subscription.routes.js";
import { adminRoutes } from "./admin/index.js";
import { appleWebhookRoutes } from "../webhooks/apple.webhook.js";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public + authenticated routes
router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/templates", templateRoutes);
router.use("/festivals", festivalRoutes);
router.use("/generations", generationRoutes);
router.use("/downloads", downloadRoutes);
router.use("/users", userRoutes);
router.use("/subscriptions", subscriptionRoutes);

// Public: dynamic languages
import { languageService } from "../services/language.service.js";
router.get("/languages", async (_req, res, next) => {
  try {
    const languages = await languageService.listActive();
    res.json({ success: true, data: languages });
  } catch (err) { next(err); }
});

// Admin routes
router.use("/admin", adminRoutes);

// Webhook routes (no JWT auth — signature verification instead)
router.use("/webhooks", appleWebhookRoutes);

export { router as apiRoutes };
