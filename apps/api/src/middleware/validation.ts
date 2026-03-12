import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Zod validation middleware factory.
 * Validates request body, params, and/or query against provided schemas.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ZodError[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push(result.error);
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push(result.error);
      } else {
        Object.assign(req.params, result.data);
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push(result.error);
      } else {
        // Replace req.query with validated + transformed data so controllers
        // can read it directly (matching the pattern used for body/params).
        req.query = result.data as typeof req.query;
      }
    }

    if (errors.length > 0) {
      // Merge all Zod errors into one
      const merged = new ZodError(errors.flatMap((e) => e.issues));
      next(merged);
      return;
    }

    next();
  };
}
