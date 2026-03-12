import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "EP-Product API",
      version: "1.0.0",
      description:
        "Festival creatives dynamic image generation platform API. Supports user authentication, template management, AI-powered image generation (3 quality tiers), subscription-based credits, and admin content management.",
      contact: {
        name: "EP-Product Support",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT access token. Obtain via POST /auth/login",
        },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { type: "object" },
            message: { type: "string" },
          },
        },
        PaginationMeta: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            role: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] },
            phone: { type: "string", nullable: true },
            avatarUrl: { type: "string", nullable: true },
          },
        },
        Category: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            contentType: { type: "string", enum: ["EVENT", "POSTER"] },
            description: { type: "string", nullable: true },
            isActive: { type: "boolean" },
            fieldSchemas: {
              type: "array",
              items: { $ref: "#/components/schemas/FieldSchema" },
            },
          },
        },
        FieldSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            fieldKey: { type: "string" },
            label: { type: "string" },
            fieldType: {
              type: "string",
              enum: ["TEXT", "TEXTAREA", "NUMBER", "PHONE", "EMAIL", "URL", "DATE"],
            },
            isRequired: { type: "boolean" },
            hasPosition: { type: "boolean" },
            placeholder: { type: "string", nullable: true },
          },
        },
        Template: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            contentType: { type: "string", enum: ["EVENT", "POSTER"] },
            imageUrl: { type: "string" },
            width: { type: "integer" },
            height: { type: "integer" },
            isActive: { type: "boolean" },
            category: { $ref: "#/components/schemas/Category" },
          },
        },
        Generation: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: {
              type: "string",
              enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
            },
            qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
            language: { type: "string" },
            creditCost: { type: "integer" },
            resultImageUrl: { type: "string", nullable: true },
            errorMessage: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            errors: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication & registration" },
      { name: "Users", description: "User profile management" },
      { name: "Categories", description: "Content categories (user-facing)" },
      { name: "Templates", description: "Template browsing (user-facing)" },
      { name: "Festivals", description: "Festival calendar" },
      { name: "Generations", description: "Image generation" },
      { name: "Downloads", description: "Download management" },
{ name: "Admin - Categories", description: "Admin category management" },
      { name: "Admin - Templates", description: "Admin template management" },
      { name: "Admin - Festivals", description: "Admin festival management" },
      { name: "Admin - Pricing", description: "Subscription plans & model pricing" },
      { name: "Admin - Analytics", description: "Dashboard & monitoring" },
      { name: "Admin - Audit", description: "Audit log viewer" },
    ],
    paths: {
      // ─── Auth ─────────────────────────────────────
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "name"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    name: { type: "string", minLength: 2 },
                    phone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "User registered successfully" },
            409: { description: "Email already exists" },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email and password",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful with access + refresh tokens" },
            401: { description: "Invalid credentials" },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: { refreshToken: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "New token pair" } },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout (invalidate refresh token)",
          responses: { 200: { description: "Logged out" } },
        },
      },

      // ─── Users ────────────────────────────────────
      "/users/me": {
        get: {
          tags: ["Users"],
          summary: "Get current user profile",
          responses: { 200: { description: "User profile" } },
        },
        patch: {
          tags: ["Users"],
          summary: "Update current user profile",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    phone: { type: "string", nullable: true },
                    avatarUrl: { type: "string", format: "uri", nullable: true },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated profile" } },
        },
      },

      // ─── Categories ───────────────────────────────
      "/categories": {
        get: {
          tags: ["Categories"],
          summary: "List categories (with field schemas)",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "isActive", in: "query", schema: { type: "boolean" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated category list" } },
        },
      },

      // ─── Templates ────────────────────────────────
      "/templates": {
        get: {
          tags: ["Templates"],
          summary: "List templates",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "categoryId", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Paginated template list" } },
        },
      },
      "/templates/{id}": {
        get: {
          tags: ["Templates"],
          summary: "Get template detail with safe zones and field schemas",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Template detail" }, 404: { description: "Not found" } },
        },
      },

      // ─── Generations ──────────────────────────────
      "/generations": {
        post: {
          tags: ["Generations"],
          summary: "Create a new generation",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["contentType", "categoryId", "qualityTier", "language", "prompt", "fieldValues", "positionMap"],
                  properties: {
                    templateId: { type: "string" },
                    baseImageUrl: { type: "string" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    categoryId: { type: "string" },
                    qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
                    language: { type: "string" },
                    prompt: { type: "string" },
                    fieldValues: { type: "object" },
                    positionMap: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Generation created and queued" },
            400: { description: "Validation error / insufficient credits" },
          },
        },
      },
      "/generations/{id}": {
        get: {
          tags: ["Generations"],
          summary: "Get generation by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Generation details" } },
        },
      },
      "/generations/{id}/status": {
        get: {
          tags: ["Generations"],
          summary: "SSE endpoint for generation status updates",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Server-Sent Events stream" } },
        },
      },

      // ─── Admin Analytics ──────────────────────────
      "/admin/analytics/dashboard": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get dashboard stats (8 metrics)",
          responses: { 200: { description: "Dashboard statistics" } },
        },
      },
      "/admin/analytics/trends": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get generation trends by day",
          parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }],
          responses: { 200: { description: "Generation trends grouped by date and tier" } },
        },
      },
      "/admin/analytics/costs": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get AI provider cost metrics",
          responses: { 200: { description: "Daily spend, thresholds, tier status" } },
        },
      },
    },
  },
  apis: [], // We define all paths inline above
};

export const swaggerSpec = swaggerJSDoc(options);
