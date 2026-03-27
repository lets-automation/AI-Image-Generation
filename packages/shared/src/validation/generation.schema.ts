import { z } from "zod";
import { GENERATION_LIMITS } from "../constants/limits.js";

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

const qualityTierEnum = z.enum(["BASIC", "STANDARD", "PREMIUM"]);

// Languages are now dynamic (stored in system_languages table)
// Accept any non-empty string as a language code
const languageValidator = z.string().min(1);

const contentTypeEnum = z.enum(["EVENT", "POSTER"]);

const orientationEnum = z.enum(["SQUARE", "PORTRAIT", "LANDSCAPE", "STORY", "WIDE"]);

const fieldValueSchema = z.union([
  z.string().max(GENERATION_LIMITS.MAX_FIELD_VALUE_LENGTH),
  z.number(),
]);

export const createGenerationSchema = z
  .object({
    templateId: z.string().cuid().optional(),
    baseImageUrl: z.string().url("Invalid base image URL").nullable().optional(),
    contentType: contentTypeEnum,
    categoryId: z.string().cuid("Invalid category ID").optional(),
    qualityTier: qualityTierEnum,
    orientation: orientationEnum.nullable().optional(), // User-chosen image orientation
    languages: z
      .array(languageValidator)
      .min(1, "Select at least one language")
      .max(10)
      .default(["ENGLISH"]),
    prompt: z
      .string()
      .max(
        GENERATION_LIMITS.MAX_PROMPT_LENGTH,
        `Prompt must be at most ${GENERATION_LIMITS.MAX_PROMPT_LENGTH} characters`
      )
      .trim()
      .default(""),
    isPublic: z.boolean().optional().default(false),
    fieldValues: z.record(
      z.string(),
      z.union([
        fieldValueSchema,
        z.array(fieldValueSchema),
        z.array(z.record(z.string(), fieldValueSchema)),
      ])
    ),
    positionMap: z.record(z.string(), positionEnum),
  })
  .refine((data) => data.templateId || data.baseImageUrl, {
    message: "Either templateId or baseImageUrl must be provided",
    path: ["templateId"],
  });

export const generationIdParam = z.object({
  id: z.string().cuid("Invalid generation ID"),
});

export const generationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  contentType: contentTypeEnum.optional(),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type GenerationListQuery = z.infer<typeof generationListQuery>;
