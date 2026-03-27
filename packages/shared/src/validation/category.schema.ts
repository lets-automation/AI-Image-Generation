import { z } from "zod";

const fieldTypeEnum = z.enum([
  "TEXT",
  "TEXTAREA",
  "IMAGE",
  "COLOR",
  "SELECT",
  "NUMBER",
  "PHONE",
  "EMAIL",
  "URL",
]);

const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    pattern: z.string().optional(),
    options: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
        })
      )
      .optional(),
    maxFileSize: z.number().int().min(1).optional(),
    allowedFormats: z.array(z.string()).optional(),
  })
  .optional();

const fieldDisplayConfigSchema = z
  .object({
    width: z.enum(["full", "half"]).optional(),
    helpText: z.string().max(200).optional(),
    conditionalOn: z
      .object({
        fieldKey: z.string(),
        value: z.string(),
      })
      .optional(),
  })
  .optional();

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase with hyphens"
    ),
  contentType: z.enum(["EVENT", "POSTER"]),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  parentId: z.string().cuid().optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createFieldSchemaInput = z.object({
  fieldKey: z
    .string()
    .min(2)
    .max(50)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Field key must be snake_case starting with a letter"
    ),
  label: z.string().min(2).max(100).trim(),
  fieldType: fieldTypeEnum,
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  placeholder: z.string().max(200).optional(),
  defaultValue: z.string().max(200).optional(),
  hasPosition: z.boolean().default(false),
  isRepeatable: z.boolean().default(false),
  maxRepeat: z.number().int().min(1).max(20).default(1),
  groupKey: z.string().min(2).max(50).regex(/^[a-z][a-z0-9_]*$/, "Group key must be snake_case").optional().nullable(),
  validation: fieldValidationSchema,
  displayConfig: fieldDisplayConfigSchema,
});

export const updateFieldSchemaInput = createFieldSchemaInput.partial();

export const categoryListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  contentType: z.enum(["EVENT", "POSTER"]).optional(),
  isActive: z.coerce.boolean().optional(),
  parentId: z.string().optional(), // filter: undefined=all, "null"=top-level, cuid=children of parent
  search: z.string().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateFieldSchemaInput = z.infer<typeof createFieldSchemaInput>;
export type UpdateFieldSchemaInput = z.infer<typeof updateFieldSchemaInput>;
export type CategoryListQuery = z.infer<typeof categoryListQuery>;
