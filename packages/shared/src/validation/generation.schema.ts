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

const orientationEnum = z.enum(["SQUARE", "SQUARE_HD", "PORTRAIT", "LANDSCAPE", "STORY", "WIDE"]);

const fieldValueSchema = z.union([
  z.string().max(GENERATION_LIMITS.MAX_FIELD_VALUE_LENGTH),
  z.number(),
]);

export const createGenerationSchema = z
  .object({
    templateId: z.string().cuid().optional(),
    baseImageUrl: z.string().url("Invalid base image URL").nullable().optional(),
    baseImageUrls: z.array(z.string().url("Invalid base image URL")).min(1).optional(),
    customUploadMode: z.enum(["SEPARATE", "COMBINE"]).optional(),
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
  .refine((data) => data.templateId || data.baseImageUrl || (data.baseImageUrls && data.baseImageUrls.length > 0), {
    message: "Either templateId or baseImageUrl/baseImageUrls must be provided",
    path: ["templateId"],
  });

// ─── Video generation ───────────────────────────────────────

const videoDurationEnum = z.union([z.literal(15), z.literal(30)]);

// Imported lazily-typed to avoid a hard dep order between this schema and
// the constants module (both are exported from index.ts).
const MAX_REF_IMAGES = 9;
/** Hard floor on a video prompt — covers text-to-video where prompt is the only input. */
const MIN_VIDEO_PROMPT_LENGTH = 5;
/** Native max single-clip duration on the provider (Seedance 2.0). */
const VIDEO_NATIVE_CLIP_SEC = 15;

const singleVideoPromptValidator = z
  .string()
  .trim()
  .min(MIN_VIDEO_PROMPT_LENGTH, "Please describe what should happen in the video")
  .max(
    GENERATION_LIMITS.MAX_PROMPT_LENGTH,
    `Prompt must be at most ${GENERATION_LIMITS.MAX_PROMPT_LENGTH} characters`
  );

/**
 * Video generation request. Three valid modes:
 *
 *   1. text-to-video       — prompt only, no source image
 *   2. image-to-video      — prompt + 1 source image (becomes the first frame)
 *   3. omni-reference      — prompt + 2..9 images (first = first frame, rest = style/character refs)
 *
 * `templateId` and `baseImageUrls` are both optional. When both are absent,
 * Seedance generates from the prompt alone. When `baseImageUrls` is provided,
 * it must be 1..9 entries and the first becomes the conditioning first frame.
 *
 * Prompts: 30-second outputs are produced as 2 stitched 15s clips. The user
 * may supply a per-clip script via `prompts` (length must equal clipCount =
 * ceil(durationSec / 15)). For back-compat we also accept the singular
 * `prompt` field — that path falls back to a continuation directive for
 * clip 2, which is the source of the duplicate-script bug. New clients
 * should always send `prompts`.
 */
export const createVideoGenerationSchema = z
  .object({
    templateId: z.string().cuid().optional(),
    /** First entry becomes the first frame; remaining entries are reference images. */
    baseImageUrls: z
      .array(z.string().url("Invalid base image URL"))
      .min(1, "At least one source image is required if you provide images")
      .max(MAX_REF_IMAGES, `Up to ${MAX_REF_IMAGES} reference images allowed`)
      .optional(),
    qualityTier: qualityTierEnum,
    durationSec: videoDurationEnum,
    /** Legacy single prompt — used for the whole video, with a continuation directive for clip 2. */
    prompt: singleVideoPromptValidator.optional(),
    /** Per-clip prompts. When present, length must match ceil(durationSec / 15). */
    prompts: z.array(singleVideoPromptValidator).min(1).max(2).optional(),
  })
  .refine(
    (data) => Boolean(data.prompt) || (Array.isArray(data.prompts) && data.prompts.length > 0),
    { message: "Provide either `prompt` or `prompts`", path: ["prompt"] }
  )
  .refine(
    (data) => {
      if (!data.prompts) return true;
      const expected = Math.ceil(data.durationSec / VIDEO_NATIVE_CLIP_SEC);
      return data.prompts.length === expected;
    },
    {
      message: "`prompts` length must equal ceil(durationSec / 15) — 1 entry for 15s, 2 entries for 30s",
      path: ["prompts"],
    }
  );

export type CreateVideoGenerationInput = z.infer<typeof createVideoGenerationSchema>;

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
  jobType: z.enum(["IMAGE", "VIDEO"]).optional(),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type GenerationListQuery = z.infer<typeof generationListQuery>;
