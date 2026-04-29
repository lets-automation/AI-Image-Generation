import type { Express } from "express";
import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { extractRoutes, ExtractedRoute } from "./introspect.js";

// Enable .openapi() on Zod schemas (one-time, idempotent)
extendZodWithOpenApi(z);

const SUCCESS_ENVELOPE = z
  .object({
    success: z.boolean().openapi({ example: true }),
    data: z.any().describe("Endpoint-specific payload"),
  })
  .openapi("ApiSuccess");

const PAGINATED_ENVELOPE = z
  .object({
    success: z.boolean().openapi({ example: true }),
    data: z.array(z.any()),
    meta: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
        totalPages: z.number().int(),
      })
      .partial(),
  })
  .openapi("ApiPaginated");

const ERROR_ENVELOPE = z
  .object({
    success: z.boolean().openapi({ example: false }),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    }),
  })
  .openapi("ApiError");

/**
 * Heuristically derive a Swagger tag from the URL path.
 * /api/v1/templates/{id} -> "Templates"
 * /api/v1/admin/categories -> "Admin · Categories"
 */
function deriveTag(path: string): string {
  const cleaned = path.replace(/^\/api\/v\d+\//, "").replace(/^\/+/, "");
  const parts = cleaned.split("/");
  if (parts[0] === "admin" && parts[1]) {
    return `Admin · ${capitalize(parts[1].replace(/[-_]/g, " "))}`;
  }
  if (parts[0] === "webhooks") {
    return "Webhooks";
  }
  return capitalize(parts[0] || "Misc");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a human-readable summary from method + path.
 * Tries to be specific: GET /templates/{id} -> "Get template by id"
 */
function deriveSummary(method: string, path: string): string {
  const segments = path
    .replace(/^\/api\/v\d+\//, "")
    .split("/")
    .filter(Boolean);
  const last = segments[segments.length - 1] || "";
  const isIdLeaf = /^\{[^}]+\}$/.test(last);
  const resourcePart = isIdLeaf ? segments[segments.length - 2] || "" : last;
  const resource = resourcePart.replace(/[-_]/g, " ");

  const verbMap: Record<string, string> = {
    get: isIdLeaf ? `Get ${singular(resource)} by id` : `List ${resource}`,
    post: `Create ${singular(resource)}`,
    put: `Replace ${singular(resource)}`,
    patch: `Update ${singular(resource)}`,
    delete: `Delete ${singular(resource)}`,
  };
  return verbMap[method] || `${method.toUpperCase()} ${path}`;
}

function singular(word: string): string {
  if (!word) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function buildPathParamsSchema(params: string[]): z.ZodObject<any> | undefined {
  if (params.length === 0) return undefined;
  const shape: Record<string, z.ZodString> = {};
  for (const p of params) {
    shape[p] = z.string().openapi({ description: `Path parameter \`${p}\`` });
  }
  return z.object(shape);
}

function registerRoute(registry: OpenAPIRegistry, route: ExtractedRoute) {
  const tag = deriveTag(route.path);
  const summary = deriveSummary(route.method, route.path);

  // Merge inferred path params (always strings) with any explicit Zod params
  // schema. The explicit one takes precedence per-key.
  const inferredParams = buildPathParamsSchema(route.pathParams);
  const paramsSchema = route.paramsSchema
    ? (inferredParams ? inferredParams.merge(route.paramsSchema as any) : (route.paramsSchema as any))
    : inferredParams;

  const security =
    route.authType === "required" ? [{ bearerAuth: [] }] : undefined;

  const description = [
    route.adminOnly ? "**Admin endpoint**" : null,
    route.permission ? `Required permission: \`${route.permission}\`` : null,
    route.authType === "optional"
      ? "Authentication is optional — response may differ for authenticated users."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const requestConfig: any = {};
  if (paramsSchema) requestConfig.params = paramsSchema;
  if (route.querySchema) requestConfig.query = route.querySchema as any;
  if (route.bodySchema) {
    requestConfig.body = {
      content: {
        "application/json": {
          schema: route.bodySchema as any,
        },
      },
    };
  }

  const responseSchema =
    route.method === "get" && /list|grouped|public|trends|logs/.test(route.path)
      ? PAGINATED_ENVELOPE
      : SUCCESS_ENVELOPE;

  registry.registerPath({
    method: route.method,
    path: route.path,
    summary,
    description: description || undefined,
    tags: [tag],
    ...(security ? { security } : {}),
    request: Object.keys(requestConfig).length > 0 ? requestConfig : undefined,
    responses: {
      200: {
        description: "Successful response",
        content: {
          "application/json": { schema: responseSchema },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: ERROR_ENVELOPE } },
      },
      ...(route.authType === "required"
        ? {
            401: {
              description: "Unauthorized — missing or invalid bearer token",
              content: { "application/json": { schema: ERROR_ENVELOPE } },
            },
            403: {
              description: "Forbidden — insufficient permissions",
              content: { "application/json": { schema: ERROR_ENVELOPE } },
            },
          }
        : {}),
      500: {
        description: "Server error",
        content: { "application/json": { schema: ERROR_ENVELOPE } },
      },
    },
  });
}

export function buildOpenApiSpec(app: Express) {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  const routes = extractRoutes(app);

  // Stable ordering: by path then method
  routes.sort((a, b) =>
    a.path === b.path
      ? a.method.localeCompare(b.method)
      : a.path.localeCompare(b.path)
  );

  for (const route of routes) {
    try {
      registerRoute(registry, route);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[openapi] Failed to register ${route.method.toUpperCase()} ${route.path}:`,
        (err as Error).message
      );
    }
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "EP-Product API",
      version: "1.0.0",
      description:
        "Auto-generated from Express routes + Zod validators. Every registered route appears here automatically — no manual JSDoc required.",
    },
    servers: [
      { url: "/api/v1", description: "Current host" },
      { url: "https://aiimagegenerator.design/api/v1", description: "Production" },
    ],
  });
}
