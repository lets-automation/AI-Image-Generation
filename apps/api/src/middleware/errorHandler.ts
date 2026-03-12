import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Zod validation errors — safe to expose field-level details
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".");
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }

    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details,
      },
    });
    return;
  }

  // Operational errors (expected, safe to expose)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Prisma errors — sanitize before sending to client
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ code: err.code, meta: err.meta }, "Prisma error");

    if (err.code === "P2002") {
      // Unique constraint violation
      const field = (err.meta?.target as string[])?.join(", ") || "field";
      res.status(409).json({
        success: false,
        error: {
          code: "CONFLICT",
          message: `A record with this ${field} already exists`,
        },
      });
      return;
    }

    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Record not found" },
      });
      return;
    }

    // Other Prisma errors — generic message (never expose raw DB errors)
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "A database error occurred",
      },
    });
    return;
  }

  // Unexpected errors — log full details server-side, generic message to client
  logger.error({ err }, "Unhandled error");

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
