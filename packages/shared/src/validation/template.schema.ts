import { z } from "zod";

const positionEnum = z.enum([
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "MIDDLE_LEFT",
  "MIDDLE_CENTER",
  "MIDDLE_RIGHT",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
]);

const safeZoneSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "logo", "both"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  padding: z.number().min(0).max(50).default(8),
  maxFontSize: z.number().min(8).max(200).optional(),
  position: positionEnum,
});

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  contentType: z.enum(["EVENT", "POSTER"]),
  categoryId: z.string().cuid(),
  safeZones: z.array(safeZoneSchema).default([]),
  metadata: z
    .object({
      tags: z.array(z.string()).optional(),
      description: z.string().max(500).optional(),
      seasonalHint: z.string().max(100).optional(),
    })
    .optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const updateSafeZonesSchema = z.object({
  safeZones: z.array(safeZoneSchema).min(0),
});

export const templateListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  contentType: z.enum(["EVENT", "POSTER"]).optional(),
  categoryId: z.string().cuid().optional(),
  isActive: z.coerce.boolean().optional(),
  aspectRatio: z.enum(["SQUARE", "PORTRAIT", "LANDSCAPE"]).optional(),
  search: z.string().optional(),
});

export const templateGroupedQuery = z.object({
  contentType: z.enum(["EVENT", "POSTER"]),
  aspectRatio: z.enum(["SQUARE", "PORTRAIT", "LANDSCAPE"]).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type UpdateSafeZonesInput = z.infer<typeof updateSafeZonesSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuery>;
export type TemplateGroupedQuery = z.infer<typeof templateGroupedQuery>;
export type SafeZoneInput = z.infer<typeof safeZoneSchema>;
