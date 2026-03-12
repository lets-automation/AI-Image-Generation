import { Router } from "express";
import { authenticate, requireRole, requireAdminAccess } from "../../middleware/auth.js";
import { validate } from "../../middleware/validation.js";
import { uploadTemplateImage, scanUploadedImage, validateTemplateDimensions } from "../../middleware/upload.js";
import { categoryController } from "../../controllers/category.controller.js";
import { templateController } from "../../controllers/template.controller.js";
import { festivalController } from "../../controllers/festival.controller.js";
import { pricingController } from "../../controllers/admin/pricing.controller.js";
import { auditController } from "../../controllers/admin/audit.controller.js";
import { analyticsController } from "../../controllers/admin/analytics.controller.js";
import { subscriptionPlanController } from "../../controllers/admin/subscription-plan.controller.js";
import { userController } from "../../controllers/admin/user.controller.js";
import { roleController } from "../../controllers/admin/role.controller.js";
import { generationHistoryController } from "../../controllers/admin/generation-history.controller.js";
import {
  createCategorySchema,
  updateCategorySchema,
  createFieldSchemaInput,
  updateFieldSchemaInput,
  updateSafeZonesSchema,
  categoryListQuery,
  templateListQuery,
} from "@ep/shared";
import { z } from "zod";

const router = Router();

// All admin routes require auth + AT LEAST 1 valid permission
router.use(authenticate);
router.use(requireAdminAccess());

// Categories 

router.get(
  "/categories",
  requireAdminAccess("categories.read"),
  validate({ query: categoryListQuery }),
  categoryController.list.bind(categoryController)
);

router.get(
  "/categories/:id",
  requireAdminAccess("categories.read"),
  categoryController.getById.bind(categoryController)
);

router.post(
  "/categories",
  requireAdminAccess("categories.write"),
  validate({ body: createCategorySchema }),
  categoryController.create.bind(categoryController)
);

router.patch(
  "/categories/:id",
  requireAdminAccess("categories.write"),
  validate({ body: updateCategorySchema }),
  categoryController.update.bind(categoryController)
);

router.delete(
  "/categories/:id",
  requireAdminAccess("categories.write"),
  categoryController.delete.bind(categoryController)
);

// Category Field Schemas 

router.post(
  "/categories/:id/fields",
  requireAdminAccess("categories.write"),
  validate({ body: createFieldSchemaInput }),
  categoryController.addField.bind(categoryController)
);

router.patch(
  "/categories/:id/fields/:fieldId",
  requireAdminAccess("categories.write"),
  validate({ body: updateFieldSchemaInput }),
  categoryController.updateField.bind(categoryController)
);

router.delete(
  "/categories/:id/fields/:fieldId",
  requireAdminAccess("categories.write"),
  categoryController.deleteField.bind(categoryController)
);

router.put(
  "/categories/:id/fields/reorder",
  requireAdminAccess("categories.write"),
  validate({
    body: z.object({
      fieldOrders: z.array(
        z.object({ id: z.string().cuid(), sortOrder: z.number().int().min(0) })
      ),
    }),
  }),
  categoryController.reorderFields.bind(categoryController)
);

// Templates 

router.get(
  "/templates",
  requireAdminAccess("templates.read"),
  validate({ query: templateListQuery }),
  templateController.list.bind(templateController)
);

router.get(
  "/templates/:id",
  requireAdminAccess("templates.read"),
  templateController.getById.bind(templateController)
);

router.post(
  "/templates",
  requireAdminAccess("templates.write"),
  uploadTemplateImage,
  scanUploadedImage,
  validateTemplateDimensions,
  templateController.create.bind(templateController)
);

router.patch(
  "/templates/:id",
  requireAdminAccess("templates.write"),
  templateController.update.bind(templateController)
);

router.put(
  "/templates/:id/safe-zones",
  requireAdminAccess("templates.write"),
  validate({ body: updateSafeZonesSchema }),
  templateController.updateSafeZones.bind(templateController)
);

router.put(
  "/templates/:id/image",
  requireAdminAccess("templates.write"),
  uploadTemplateImage,
  scanUploadedImage,
  validateTemplateDimensions,
  templateController.replaceImage.bind(templateController)
);

router.delete(
  "/templates/:id",
  requireAdminAccess("templates.write"),
  templateController.delete.bind(templateController)
);

// Festivals 

const festivalListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  contentType: z.enum(["EVENT", "POSTER"]).optional(),
  upcoming: z.coerce.boolean().optional(),
});

const createFestivalSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  description: z.string().max(500).optional(),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid date"),
  contentType: z.enum(["EVENT", "POSTER"]),
  visibilityDays: z.number().int().min(1).max(90).optional(),
  metadata: z
    .object({
      region: z.array(z.string()).optional(),
      religion: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

const updateFestivalSchema = createFestivalSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.get(
  "/festivals",
  requireAdminAccess("festivals.read"),
  validate({ query: festivalListQuery }),
  festivalController.list.bind(festivalController)
);

router.get(
  "/festivals/:id",
  requireAdminAccess("festivals.read"),
  festivalController.getById.bind(festivalController)
);

router.post(
  "/festivals",
  requireAdminAccess("festivals.write"),
  validate({ body: createFestivalSchema }),
  festivalController.create.bind(festivalController)
);

router.patch(
  "/festivals/:id",
  requireAdminAccess("festivals.write"),
  validate({ body: updateFestivalSchema }),
  festivalController.update.bind(festivalController)
);

router.delete(
  "/festivals/:id",
  requireAdminAccess("festivals.write"),
  festivalController.delete.bind(festivalController)
);

// Model Pricing 

const createModelPricingSchema = z.object({
  qualityTier: z.enum(["BASIC", "STANDARD", "PREMIUM"]),
  providerName: z.string().min(1).max(50),
  modelId: z.string().min(1).max(100),
  creditCost: z.number().int().min(1),
  priority: z.number().int().min(0).optional(),
  config: z.record(z.unknown()).optional(),
});

const updateModelPricingSchema = z.object({
  creditCost: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  config: z.record(z.unknown()).optional(),
});

router.get(
  "/model-pricing",
  requireAdminAccess("models.read"),
  pricingController.listModelPricing.bind(pricingController)
);

router.post(
  "/model-pricing",
  requireAdminAccess("models.write"),
  validate({ body: createModelPricingSchema }),
  pricingController.createModelPricing.bind(pricingController)
);

router.patch(
  "/model-pricing/:id",
  requireAdminAccess("models.write"),
  validate({ body: updateModelPricingSchema }),
  pricingController.updateModelPricing.bind(pricingController)
);

router.delete(
  "/model-pricing/:id",
  requireAdminAccess("models.write"),
  pricingController.deleteModelPricing.bind(pricingController)
);

// Subscription Plans 

const createSubscriptionPlanSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  appleProductId: z.string().min(1).max(200),
  googleProductId: z.string().max(200).optional().nullable(),
  weeklyCredits: z.number().int().min(1),
  tierAccess: z.array(z.enum(["BASIC", "STANDARD", "PREMIUM"])).min(1),
  priceInr: z.number().int().min(0),
  sortOrder: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.partial();

router.get(
  "/subscription-plans",
  requireAdminAccess("subscriptions.read"),
  subscriptionPlanController.list.bind(subscriptionPlanController)
);

router.get(
  "/subscription-plans/:id",
  requireAdminAccess("subscriptions.read"),
  subscriptionPlanController.getById.bind(subscriptionPlanController)
);

router.post(
  "/subscription-plans",
  requireAdminAccess("subscriptions.write"),
  validate({ body: createSubscriptionPlanSchema }),
  subscriptionPlanController.create.bind(subscriptionPlanController)
);

router.patch(
  "/subscription-plans/:id",
  requireAdminAccess("subscriptions.write"),
  validate({ body: updateSubscriptionPlanSchema }),
  subscriptionPlanController.update.bind(subscriptionPlanController)
);

router.delete(
  "/subscription-plans/:id",
  requireAdminAccess("subscriptions.write"),
  subscriptionPlanController.delete.bind(subscriptionPlanController)
);

// Analytics & Dashboard 

router.get("/analytics/dashboard", requireAdminAccess("analytics.read"), analyticsController.dashboard.bind(analyticsController));
router.get("/analytics/trends", requireAdminAccess("analytics.read"), analyticsController.trends.bind(analyticsController));
router.get("/analytics/costs", requireAdminAccess("analytics.read"), analyticsController.costs.bind(analyticsController));
router.get("/analytics/top-templates", requireAdminAccess("analytics.read"), analyticsController.topTemplates.bind(analyticsController));
router.get("/analytics/failures", requireAdminAccess("analytics.read"), analyticsController.recentFailures.bind(analyticsController));

// Audit Logs 

const auditLogQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  userId: z.string().optional(),
  entity: z.string().optional(),
  action: z.string().optional(),
});

router.get(
  "/audit-logs",
  requireAdminAccess("audit.read"),
  validate({ query: auditLogQuery }),
  auditController.list.bind(auditController)
);

// User Management 

const userListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  search: z.string().optional(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]),
});

const createAdminSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(8).max(128).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain uppercase, lowercase, and a number"
  ),
  name: z.string().min(2).max(100).trim(),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]),
});

router.get(
  "/users",
  requireAdminAccess("users.read"),
  validate({ query: userListQuery }),
  userController.list.bind(userController)
);

router.patch(
  "/users/:id/role",
  requireAdminAccess("users.roles"),
  validate({ body: updateUserRoleSchema }),
  userController.updateRole.bind(userController)
);

router.patch(
  "/users/:id/toggle-active",
  requireAdminAccess("users.write"),
  userController.toggleActive.bind(userController)
);

router.patch(
  "/users/:id/toggle-generation",
  requireAdminAccess("users.write"),
  userController.toggleGenerationAccess.bind(userController)
);

router.post(
  "/users/create-admin",
  requireRole("SUPER_ADMIN"),
  validate({ body: createAdminSchema }),
  userController.createAdmin.bind(userController)
);

// Custom Roles 

const createRoleSchema = z.object({
  name: z.string().min(2).max(50).trim(),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().min(1)).min(1),
});

const updateCustomRoleSchema = z.object({
  name: z.string().min(2).max(50).trim().optional(),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().min(1)).min(1).optional(),
});

router.get("/roles", requireAdminAccess("users.roles"), roleController.list.bind(roleController));
router.get("/roles/:id", requireAdminAccess("users.roles"), roleController.getById.bind(roleController));

router.post(
  "/roles",
  requireRole("SUPER_ADMIN"),
  validate({ body: createRoleSchema }),
  roleController.create.bind(roleController)
);

router.patch(
  "/roles/:id",
  requireRole("SUPER_ADMIN"),
  validate({ body: updateCustomRoleSchema }),
  roleController.update.bind(roleController)
);

router.delete(
  "/roles/:id",
  requireRole("SUPER_ADMIN"),
  roleController.delete.bind(roleController)
);

router.patch(
  "/users/:id/custom-role",
  requireRole("SUPER_ADMIN"),
  validate({ body: z.object({ customRoleId: z.string().nullable() }) }),
  roleController.assignToUser.bind(roleController)
);

// Generation History 

const generationHistoryQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  qualityTier: z.enum(["BASIC", "STANDARD", "PREMIUM"]).optional(),
  provider: z.string().optional(),
  userId: z.string().optional(),
  batchId: z.string().optional(),
});

router.get(
  "/generations",
  requireAdminAccess("generations.read"),
  validate({ query: generationHistoryQuery }),
  generationHistoryController.list.bind(generationHistoryController)
);

router.get(
  "/generations/stats",
  requireAdminAccess("generations.read"),
  generationHistoryController.stats.bind(generationHistoryController)
);

// System Config 

import { prisma } from "../../config/database.js";
import type { Request, Response, NextFunction } from "express";

/** Allowlist of valid system config keys — prevents arbitrary key injection */
const ALLOWED_SYSTEM_CONFIG_KEYS = new Set([
  "cost_warning_threshold",
  "cost_critical_threshold",
  "cost_emergency_threshold",
  "daily_generation_limit",
  "concurrent_job_limit",
  "maintenance_mode",
  "default_quality_tier",
  "max_batch_size",
]);

const updateSystemConfigSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

router.get(
  "/system-config",
  requireAdminAccess("system.config"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
      res.json({ success: true, data: configs });
    } catch (err) { next(err); }
  }
);

router.patch(
  "/system-config/:key",
  requireAdminAccess("system.config"),
  validate({ body: updateSystemConfigSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as string;

      if (!ALLOWED_SYSTEM_CONFIG_KEYS.has(key)) {
        res.status(400).json({
          success: false,
          error: { message: `Invalid config key: "${key}". Allowed keys: ${[...ALLOWED_SYSTEM_CONFIG_KEYS].join(", ")}` },
        });
        return;
      }

      const config = await prisma.systemConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(req.body.value) },
        create: { key, value: JSON.stringify(req.body.value) },
      });
      res.json({ success: true, data: config });
    } catch (err) { next(err); }
  }
);

// ─── Languages ────────────────────────────────────────────────

import { languageService } from "../../services/language.service.js";

router.get(
  "/languages",
  requireAdminAccess("languages.read"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const languages = await languageService.listAll();
      res.json({ success: true, data: languages });
    } catch (err) { next(err); }
  }
);

router.post(
  "/languages",
  requireAdminAccess("languages.write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, label, nativeLabel, script, fontFamily, direction } = req.body;
      if (!code || !label || !nativeLabel) {
        res.status(400).json({ success: false, error: { message: "code, label, and nativeLabel are required" } });
        return;
      }
      const language = await languageService.create({ code, label, nativeLabel, script, fontFamily, direction });
      res.status(201).json({ success: true, data: language });
    } catch (err) { next(err); }
  }
);

router.patch(
  "/languages/:id",
  requireAdminAccess("languages.write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const language = await languageService.update(req.params.id as string, req.body);
      res.json({ success: true, data: language });
    } catch (err) { next(err); }
  }
);

router.delete(
  "/languages/:id",
  requireAdminAccess("languages.write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await languageService.delete(req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

export { router as adminRoutes };
