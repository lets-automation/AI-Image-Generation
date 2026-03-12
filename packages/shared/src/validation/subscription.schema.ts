import { z } from "zod";

/**
 * Subscription validation schemas.
 */

/** Client sends signedTransactionInfo after StoreKit purchase */
export const verifyPurchaseSchema = z.object({
  signedTransactionInfo: z
    .string()
    .min(1, "signedTransactionInfo is required"),
});

/** Client sends originalTransactionId for restore after reinstall */
export const restoreSubscriptionSchema = z.object({
  originalTransactionId: z
    .string()
    .min(1, "originalTransactionId is required"),
});

/** Admin: create subscription plan */
export const createSubscriptionPlanSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  appleProductId: z.string().min(1).max(200),
  googleProductId: z.string().max(200).optional().nullable(),
  weeklyCredits: z.number().int().min(1).max(1000),
  tierAccess: z
    .array(z.enum(["BASIC", "STANDARD", "PREMIUM"]))
    .min(1, "At least one tier required"),
  priceInr: z.number().int().min(0),
  sortOrder: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
});

/** Admin: update subscription plan (all fields optional) */
export const updateSubscriptionPlanSchema =
  createSubscriptionPlanSchema.partial();
