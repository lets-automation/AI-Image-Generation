import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "EP-Product API",
      version: "1.0.0",
      description:
        "Festival creatives dynamic image generation platform API. Supports user authentication, template management, AI-powered image generation (3 quality tiers), subscription-based credits, and admin content management.\n\n" +
        "## Authentication\n" +
        "Most endpoints require a Bearer JWT token. Obtain one via `POST /auth/login`.\n" +
        "Access tokens expire in 15 minutes. Use `POST /auth/refresh` with the refresh token to get a new pair.\n\n" +
        "## Response Format\n" +
        "All responses follow the shape: `{ success: boolean, data?: T, message?: string, meta?: PaginationMeta }`\n\n" +
        "## Rate Limiting\n" +
        "Rate-limited endpoints return `429 Too Many Requests` with `X-RateLimit-*` headers.",
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
        // ─── Common ──────────────────────────────────────────
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
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 150 },
            totalPages: { type: "integer", example: 8 },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },

        // ─── Auth ────────────────────────────────────────────
        AuthTokens: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            expiresIn: { type: "integer", example: 900, description: "Seconds until access token expires" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "cuid" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            role: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] },
            phone: { type: "string", nullable: true },
            avatarUrl: { type: "string", nullable: true },
            canGenerate: { type: "boolean" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            phone: { type: "string", nullable: true },
            role: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] },
            avatarUrl: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            _count: {
              type: "object",
              properties: {
                generations: { type: "integer" },
                downloads: { type: "integer" },
              },
            },
          },
        },

        // ─── Category ────────────────────────────────────────
        FieldSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            fieldKey: { type: "string", example: "event_name" },
            label: { type: "string", example: "Event Name" },
            fieldType: {
              type: "string",
              enum: ["TEXT", "TEXTAREA", "IMAGE", "COLOR", "SELECT", "NUMBER", "PHONE", "EMAIL", "URL"],
            },
            isRequired: { type: "boolean" },
            sortOrder: { type: "integer" },
            placeholder: { type: "string", nullable: true },
            defaultValue: { type: "string", nullable: true },
            hasPosition: { type: "boolean", description: "If true, user can choose a position (9-grid) for this field" },
            validation: {
              type: "object",
              nullable: true,
              properties: {
                minLength: { type: "integer" },
                maxLength: { type: "integer" },
                pattern: { type: "string" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
            displayConfig: {
              type: "object",
              nullable: true,
              properties: {
                width: { type: "string", enum: ["full", "half"] },
                helpText: { type: "string" },
                conditionalOn: {
                  type: "object",
                  properties: {
                    fieldKey: { type: "string" },
                    value: { type: "string" },
                  },
                },
              },
            },
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
            iconUrl: { type: "string", nullable: true },
            isActive: { type: "boolean" },
            sortOrder: { type: "integer" },
            parentId: { type: "string", nullable: true },
            fieldSchemas: {
              type: "array",
              items: { $ref: "#/components/schemas/FieldSchema" },
            },
            children: {
              type: "array",
              items: { $ref: "#/components/schemas/Category" },
            },
            _count: {
              type: "object",
              properties: { templates: { type: "integer" } },
            },
            promoted: { type: "boolean", description: "True if promoted by an active festival" },
            festivalName: { type: "string", nullable: true, description: "Name of the festival promoting this category" },
          },
        },

        // ─── Template ────────────────────────────────────────
        SafeZone: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["text", "logo", "both"] },
            x: { type: "number", description: "X position (0-100%)" },
            y: { type: "number", description: "Y position (0-100%)" },
            width: { type: "number", description: "Width (1-100%)" },
            height: { type: "number", description: "Height (1-100%)" },
            padding: { type: "number", default: 8 },
            maxFontSize: { type: "number" },
            position: {
              type: "string",
              enum: ["TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "MIDDLE_LEFT", "MIDDLE_CENTER", "MIDDLE_RIGHT", "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT"],
            },
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
            safeZones: {
              type: "array",
              items: { $ref: "#/components/schemas/SafeZone" },
            },
            metadata: {
              type: "object",
              nullable: true,
              properties: {
                tags: { type: "array", items: { type: "string" } },
                description: { type: "string" },
                seasonalHint: { type: "string" },
              },
            },
            category: { $ref: "#/components/schemas/Category" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CategoryWithTemplates: {
          type: "object",
          description: "Category with its templates (for grouped view)",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            contentType: { type: "string", enum: ["EVENT", "POSTER"] },
            fieldSchemas: {
              type: "array",
              items: { $ref: "#/components/schemas/FieldSchema" },
            },
            templates: {
              type: "array",
              items: { $ref: "#/components/schemas/Template" },
            },
          },
        },

        // ─── Festival ────────────────────────────────────────
        Festival: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            date: { type: "string", format: "date" },
            contentType: { type: "string", enum: ["EVENT", "POSTER"] },
            visibilityDays: { type: "integer", description: "Days before festival date when it becomes visible" },
            isActive: { type: "boolean" },
            metadata: {
              type: "object",
              nullable: true,
              properties: {
                region: { type: "array", items: { type: "string" } },
                religion: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
            },
            promotedCategories: {
              type: "array",
              description: "Categories linked to this festival for promotion",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "FestivalCategory link ID" },
                  categoryId: { type: "string" },
                  categoryName: { type: "string" },
                  sortOrder: { type: "integer" },
                  promotionStartDays: { type: "integer", nullable: true },
                  promotionEndDays: { type: "integer" },
                },
              },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ─── Generation ──────────────────────────────────────
        Generation: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            templateId: { type: "string", nullable: true },
            contentType: { type: "string", enum: ["EVENT", "POSTER"] },
            qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
            language: { type: "string" },
            orientation: { type: "string", nullable: true, enum: ["SQUARE", "PORTRAIT", "LANDSCAPE", "STORY", "WIDE"] },
            prompt: { type: "string" },
            fieldValues: { type: "object", description: "Key-value map of field values" },
            positionMap: { type: "object", description: "Key-value map of field positions (9-grid)" },
            status: {
              type: "string",
              enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
            },
            creditCost: { type: "integer" },
            isPublic: { type: "boolean" },
            baseImageUrl: { type: "string", nullable: true },
            batchId: { type: "string", nullable: true, description: "Groups multi-language generations" },
            resultImageUrl: { type: "string", nullable: true },
            errorMessage: { type: "string", nullable: true },
            processingMs: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ─── Download ────────────────────────────────────────
        Download: {
          type: "object",
          properties: {
            id: { type: "string" },
            generationId: { type: "string" },
            format: { type: "string", enum: ["png", "jpg", "webp"] },
            resolution: { type: "string", example: "1080x1080" },
            downloadedAt: { type: "string", format: "date-time" },
            generation: { $ref: "#/components/schemas/Generation" },
          },
        },

        // ─── Subscription ───────────────────────────────────
        SubscriptionPlan: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            appleProductId: { type: "string", nullable: true },
            googleProductId: { type: "string", nullable: true },
            priceInr: { type: "integer", description: "Price in paise (100 paise = 1 INR)" },
            weeklyCredits: { type: "integer" },
            tierAccess: {
              type: "array",
              items: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
            },
            features: { type: "array", nullable: true, items: { type: "string" } },
            sortOrder: { type: "integer" },
            isActive: { type: "boolean" },
            razorpayPlanId: { type: "string", nullable: true },
          },
        },
        SubscriptionStatus: {
          type: "object",
          properties: {
            hasActiveSubscription: { type: "boolean" },
            subscription: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                planId: { type: "string" },
                planName: { type: "string" },
                tierAccess: { type: "array", items: { type: "string" } },
                status: { type: "string" },
                provider: { type: "string", enum: ["APPLE", "RAZORPAY"] },
                currentPeriodStart: { type: "string", format: "date-time" },
                currentPeriodEnd: { type: "string", format: "date-time" },
                autoRenewEnabled: { type: "boolean" },
                cancellationReason: { type: "string", nullable: true },
              },
            },
            balance: {
              type: "object",
              nullable: true,
              properties: {
                remainingCredits: { type: "integer" },
                weeklyCredits: { type: "integer" },
                periodEnd: { type: "string", format: "date-time" },
              },
            },
          },
        },

        // ─── Model Pricing ───────────────────────────────────
        ModelPricing: {
          type: "object",
          properties: {
            id: { type: "string" },
            qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
            providerName: { type: "string" },
            modelId: { type: "string" },
            creditCost: { type: "integer" },
            isActive: { type: "boolean" },
            priority: { type: "integer" },
            config: { type: "object", description: "Provider-specific config (quality, size, etc.)" },
          },
        },

        // ─── Language ────────────────────────────────────────
        SystemLanguage: {
          type: "object",
          properties: {
            id: { type: "string" },
            code: { type: "string", example: "HINDI" },
            label: { type: "string", example: "Hindi" },
            nativeLabel: { type: "string", example: "हिन्दी" },
            script: { type: "string", nullable: true, example: "Devanagari" },
            fontFamily: { type: "string", nullable: true },
            direction: { type: "string", enum: ["ltr", "rtl"], default: "ltr" },
            isActive: { type: "boolean" },
          },
        },

        // ─── Role ────────────────────────────────────────────
        CustomRole: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            permissions: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ─── Audit Log ──────────────────────────────────────
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            action: { type: "string" },
            entity: { type: "string" },
            entityId: { type: "string" },
            metadata: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ─── System Config ──────────────────────────────────
        SystemConfig: {
          type: "object",
          properties: {
            id: { type: "string" },
            key: { type: "string" },
            value: { type: "string" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ─── Credential ─────────────────────────────────────
        CredentialInfo: {
          type: "object",
          properties: {
            key: { type: "string" },
            maskedValue: { type: "string", description: "Value with middle chars masked" },
            source: { type: "string", enum: ["db", "env", "not_set"] },
          },
        },

        // ─── Analytics ───────────────────────────────────────
        DashboardStats: {
          type: "object",
          properties: {
            totalUsers: { type: "integer" },
            totalGenerations: { type: "integer" },
            totalCompletedGenerations: { type: "integer" },
            totalFailedGenerations: { type: "integer" },
            totalTemplates: { type: "integer" },
            totalCategories: { type: "integer" },
            activeSubscriptions: { type: "integer" },
            todayGenerations: { type: "integer" },
          },
        },
        GenerationTrend: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            total: { type: "integer" },
            basic: { type: "integer" },
            standard: { type: "integer" },
            premium: { type: "integer" },
          },
        },
        CostMetrics: {
          type: "object",
          properties: {
            dailySpendCents: { type: "number" },
            dailyBudgetCents: { type: "number" },
            warningThreshold: { type: "number" },
            criticalThreshold: { type: "number" },
            emergencyThreshold: { type: "number" },
            tierStatus: { type: "string", enum: ["normal", "warning", "critical", "emergency"] },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Health", description: "Server health check" },
      { name: "Auth", description: "Authentication & registration" },
      { name: "Users", description: "User profile & uploads" },
      { name: "Categories", description: "Content categories (user-facing)" },
      { name: "Templates", description: "Template browsing (user-facing)" },
      { name: "Festivals", description: "Festival calendar (user-facing)" },
      { name: "Generations", description: "AI image generation" },
      { name: "Downloads", description: "Download management" },
      { name: "Subscriptions", description: "Subscription & payment management" },
      { name: "Languages", description: "System languages" },
      { name: "Admin - Categories", description: "Admin category management (requires categories.read/write)" },
      { name: "Admin - Templates", description: "Admin template management (requires templates.read/write)" },
      { name: "Admin - Festivals", description: "Admin festival management (requires festivals.read/write)" },
      { name: "Admin - Model Pricing", description: "AI model pricing config (requires models.read/write)" },
      { name: "Admin - Subscription Plans", description: "Subscription plan management (requires subscriptions.read/write)" },
      { name: "Admin - Analytics", description: "Dashboard & monitoring (requires analytics.read)" },
      { name: "Admin - Audit", description: "Audit log viewer (requires audit.read)" },
      { name: "Admin - Users", description: "User management (requires users.read/write/roles)" },
      { name: "Admin - Roles", description: "Custom role management (SUPER_ADMIN only)" },
      { name: "Admin - Generations", description: "Generation history (requires generations.read)" },
      { name: "Admin - System Config", description: "System configuration (requires system.config)" },
      { name: "Admin - Languages", description: "Language management (requires languages.read/write)" },
      { name: "Admin - Credentials", description: "API credential management (SUPER_ADMIN only)" },
      { name: "Webhooks", description: "External service webhooks (signature-verified, no JWT)" },
    ],
    paths: {
      // ═══════════════════════════════════════════════════════
      // HEALTH
      // ═══════════════════════════════════════════════════════
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Server health check",
          security: [],
          responses: {
            200: {
              description: "Server is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // AUTH
      // ═══════════════════════════════════════════════════════
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user account",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "name"],
                  properties: {
                    email: { type: "string", format: "email", example: "user@example.com" },
                    password: {
                      type: "string",
                      minLength: 8,
                      maxLength: 72,
                      description: "Must contain uppercase, lowercase, and a digit",
                      example: "MyPass123",
                    },
                    name: { type: "string", minLength: 2, maxLength: 100, example: "John Doe" },
                    phone: { type: "string", pattern: "^\\+?[1-9]\\d{7,14}$", example: "+919876543210" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "User registered successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          user: { $ref: "#/components/schemas/User" },
                          tokens: { $ref: "#/components/schemas/AuthTokens" },
                        },
                      },
                    },
                  },
                },
              },
            },
            409: { description: "Email already exists" },
            422: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
            200: {
              description: "Login successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          user: { $ref: "#/components/schemas/User" },
                          tokens: { $ref: "#/components/schemas/AuthTokens" },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: "Invalid credentials" },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token using refresh token",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: {
                    refreshToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "New token pair issued",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/AuthTokens" },
                    },
                  },
                },
              },
            },
            401: { description: "Invalid or expired refresh token" },
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout and invalidate refresh token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: {
                    refreshToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Logged out successfully" },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current authenticated user",
          responses: {
            200: {
              description: "Current user data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            401: { description: "Not authenticated" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // USERS
      // ═══════════════════════════════════════════════════════
      "/users/me": {
        get: {
          tags: ["Users"],
          summary: "Get current user profile with stats",
          responses: {
            200: {
              description: "User profile with generation and download counts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/UserProfile" },
                    },
                  },
                },
              },
            },
          },
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
                    name: { type: "string", minLength: 2, maxLength: 100 },
                    phone: { type: "string", minLength: 10, maxLength: 15, nullable: true },
                    avatarUrl: { type: "string", format: "uri", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Updated profile",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/users/upload-logo": {
        post: {
          tags: ["Users"],
          summary: "Upload a logo image to Cloudinary",
          description: "Upload a logo image (PNG/JPG/WebP, max 5MB). Returns the Cloudinary URL. Image is scanned for security before upload.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["logo"],
                  properties: {
                    logo: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Logo uploaded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          url: { type: "string", format: "uri" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "No file provided or image too small" },
          },
        },
      },
      "/users/upload-base-image": {
        post: {
          tags: ["Users"],
          summary: "Upload a base image for generation (instead of using a template)",
          description: "Upload a base image (min 768x768px, recommended 1024x1024+). Returns URL + dimensions + warnings.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["image"],
                  properties: {
                    image: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Image uploaded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          url: { type: "string", format: "uri" },
                          width: { type: "integer" },
                          height: { type: "integer" },
                          warnings: { type: "array", items: { type: "string" } },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Image too small (min 768x768px)" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // CATEGORIES (USER-FACING)
      // ═══════════════════════════════════════════════════════
      "/categories": {
        get: {
          tags: ["Categories"],
          summary: "List categories with field schemas",
          description: "Returns paginated categories. When a festival is active, promoted categories appear first with `promoted: true` and `festivalName`.",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] }, description: "Filter by content type" },
            { name: "isActive", in: "query", schema: { type: "boolean" }, description: "Filter by active status" },
            { name: "parentId", in: "query", schema: { type: "string" }, description: "Filter by parent category. Use 'null' for top-level only." },
            { name: "search", in: "query", schema: { type: "string" }, description: "Search by name" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: {
              description: "Paginated category list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Category" },
                      },
                      meta: { $ref: "#/components/schemas/PaginationMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/categories/{id}": {
        get: {
          tags: ["Categories"],
          summary: "Get category by ID with field schemas and children",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Category detail",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Category" } } } } },
            },
            404: { description: "Category not found" },
          },
        },
      },
      "/categories/{id}/fields": {
        get: {
          tags: ["Categories"],
          summary: "Get field schemas for a category",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "List of field schemas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/FieldSchema" } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // TEMPLATES (USER-FACING)
      // ═══════════════════════════════════════════════════════
      "/templates": {
        get: {
          tags: ["Templates"],
          summary: "List templates (paginated)",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "categoryId", in: "query", schema: { type: "string" } },
            { name: "isActive", in: "query", schema: { type: "boolean" } },
            { name: "aspectRatio", in: "query", schema: { type: "string", enum: ["SQUARE", "PORTRAIT", "LANDSCAPE"] } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: {
              description: "Paginated template list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Template" } },
                      meta: { $ref: "#/components/schemas/PaginationMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/templates/grouped": {
        get: {
          tags: ["Templates"],
          summary: "Get templates grouped by category (for homepage grid)",
          description: "Returns categories with their templates embedded. Used for the homepage browsing experience where each category row shows a horizontal scroll of templates.",
          parameters: [
            { name: "contentType", in: "query", required: true, schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "aspectRatio", in: "query", schema: { type: "string", enum: ["SQUARE", "PORTRAIT", "LANDSCAPE"] } },
          ],
          responses: {
            200: {
              description: "Categories with templates",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/CategoryWithTemplates" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/templates/{id}": {
        get: {
          tags: ["Templates"],
          summary: "Get template detail with safe zones and category field schemas",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Template detail",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Template" } } } } },
            },
            404: { description: "Template not found" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // FESTIVALS (USER-FACING)
      // ═══════════════════════════════════════════════════════
      "/festivals/upcoming": {
        get: {
          tags: ["Festivals"],
          summary: "Get festivals currently in their visibility window",
          description: "Returns festivals where `(date - visibilityDays) <= now <= date + 1 day`. Includes promoted category info.",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
          ],
          responses: {
            200: {
              description: "Visible festivals",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Festival" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/festivals/{id}": {
        get: {
          tags: ["Festivals"],
          summary: "Get festival by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Festival detail", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Festival" } } } } } },
            404: { description: "Festival not found" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // GENERATIONS
      // ═══════════════════════════════════════════════════════
      "/generations": {
        post: {
          tags: ["Generations"],
          summary: "Create a new AI image generation",
          description: "Creates one or more generation jobs (one per language). Requires active subscription with sufficient credits and tier access. Rate-limited: per-minute, daily cap, and concurrent limit.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["contentType", "categoryId", "qualityTier", "fieldValues", "positionMap"],
                  properties: {
                    templateId: { type: "string", format: "cuid", description: "Template to use as style reference. Either templateId or baseImageUrl required." },
                    baseImageUrl: { type: "string", format: "uri", nullable: true, description: "User-uploaded base image URL. Either templateId or baseImageUrl required." },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    categoryId: { type: "string", format: "cuid" },
                    qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
                    orientation: { type: "string", enum: ["SQUARE", "PORTRAIT", "LANDSCAPE", "STORY", "WIDE"], description: "Output image orientation/size" },
                    languages: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 10,
                      default: ["ENGLISH"],
                      description: "Languages to generate. Creates one generation per language, grouped by batchId.",
                    },
                    prompt: { type: "string", maxLength: 2000, description: "Custom prompt for AI generation" },
                    isPublic: { type: "boolean", default: false, description: "If true, result appears in community showcase" },
                    fieldValues: {
                      type: "object",
                      additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] },
                      description: "Map of fieldKey → value. Keys must match category field schemas.",
                      example: { "event_name": "Annual Tech Summit", "date": "March 25, 2026" },
                    },
                    positionMap: {
                      type: "object",
                      additionalProperties: {
                        type: "string",
                        enum: ["TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "MIDDLE_LEFT", "MIDDLE_CENTER", "MIDDLE_RIGHT", "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT"],
                      },
                      description: "Map of fieldKey → grid position for fields with hasPosition=true",
                      example: { "event_name": "BOTTOM_CENTER", "logo": "TOP_RIGHT" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Generation(s) created and queued",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          generations: { type: "array", items: { $ref: "#/components/schemas/Generation" } },
                          batchId: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Validation error, insufficient credits, or tier not accessible" },
            403: { description: "User does not have generation permission (canGenerate=false)" },
            429: { description: "Rate limit exceeded (per-minute, daily cap, or concurrent limit)" },
          },
        },
        get: {
          tags: ["Generations"],
          summary: "List current user's generations",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] } },
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
          ],
          responses: {
            200: {
              description: "Paginated generation list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Generation" } },
                      meta: { $ref: "#/components/schemas/PaginationMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/generations/limits": {
        get: {
          tags: ["Generations"],
          summary: "Get user's daily generation limits and remaining count",
          responses: {
            200: {
              description: "Generation limit info",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          dailyLimit: { type: "integer", example: 50 },
                          usedToday: { type: "integer", example: 12 },
                          remaining: { type: "integer", example: 38 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/generations/public": {
        get: {
          tags: ["Generations"],
          summary: "List all public generations (community showcase)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
          ],
          responses: {
            200: {
              description: "Public generations",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Generation" } },
                      meta: { $ref: "#/components/schemas/PaginationMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/generations/batch/{batchId}": {
        get: {
          tags: ["Generations"],
          summary: "Get all generations in a multi-language batch",
          parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Batch generations",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Generation" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/generations/{id}": {
        get: {
          tags: ["Generations"],
          summary: "Get a single generation by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "cuid" } }],
          responses: {
            200: { description: "Generation detail", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Generation" } } } } } },
            404: { description: "Generation not found or not owned by user" },
          },
        },
      },
      "/generations/{id}/status": {
        get: {
          tags: ["Generations"],
          summary: "SSE stream for generation status updates",
          description: "Server-Sent Events endpoint. Sends status updates every 2s (DB polling) + real-time via Redis pub/sub. Auto-closes on terminal states (COMPLETED/FAILED/CANCELLED) or after 5min timeout.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "cuid" } }],
          responses: {
            200: {
              description: "SSE stream. Each event is JSON: `{ status, progress, resultImageUrl?, errorMessage? }`",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"] },
                      progress: { type: "number", minimum: 0, maximum: 100 },
                      resultImageUrl: { type: "string", nullable: true },
                      errorMessage: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // DOWNLOADS
      // ═══════════════════════════════════════════════════════
      "/downloads": {
        post: {
          tags: ["Downloads"],
          summary: "Create a download record and get signed Cloudinary URL",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["generationId"],
                  properties: {
                    generationId: { type: "string", format: "cuid" },
                    format: { type: "string", enum: ["png", "jpg", "webp"], default: "png" },
                    resolution: { type: "string", default: "1080x1080" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Download created with signed URL",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          download: { $ref: "#/components/schemas/Download" },
                          signedUrl: { type: "string", format: "uri", description: "Time-limited download URL" },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: { description: "Generation not found or not completed" },
          },
        },
        get: {
          tags: ["Downloads"],
          summary: "List current user's downloads",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
          ],
          responses: {
            200: {
              description: "Paginated download list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Download" } },
                      meta: { $ref: "#/components/schemas/PaginationMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // SUBSCRIPTIONS
      // ═══════════════════════════════════════════════════════
      "/subscriptions/plans": {
        get: {
          tags: ["Subscriptions"],
          summary: "List available subscription plans (for pricing display)",
          responses: {
            200: {
              description: "Active subscription plans sorted by sortOrder",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/SubscriptionPlan" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/subscriptions/status": {
        get: {
          tags: ["Subscriptions"],
          summary: "Get user's active subscription status and credit balance",
          responses: {
            200: {
              description: "Subscription status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/SubscriptionStatus" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/subscriptions/verify": {
        post: {
          tags: ["Subscriptions"],
          summary: "Verify Apple StoreKit purchase and activate subscription",
          description: "Client sends the signedTransactionInfo received from StoreKit after purchase. Server verifies JWS signature, decodes transaction, and activates subscription with credits.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["signedTransactionInfo"],
                  properties: {
                    signedTransactionInfo: { type: "string", description: "JWS-signed transaction from StoreKit" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Subscription verified and activated",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/SubscriptionStatus" } } } } },
            },
            400: { description: "Missing/invalid signedTransactionInfo or environment mismatch" },
          },
        },
      },
      "/subscriptions/restore": {
        post: {
          tags: ["Subscriptions"],
          summary: "Restore subscription after app reinstall or device transfer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["originalTransactionId"],
                  properties: {
                    originalTransactionId: { type: "string", description: "Original transaction ID from StoreKit" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Subscription restored (or null if not found)", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/SubscriptionStatus" } } } } } },
          },
        },
      },
      "/subscriptions/razorpay/create-order": {
        post: {
          tags: ["Subscriptions"],
          summary: "Create a Razorpay order for web payment",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["planId"],
                  properties: {
                    planId: { type: "string", format: "cuid", description: "Subscription plan ID" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Razorpay order created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          orderId: { type: "string" },
                          amount: { type: "integer", description: "Amount in paise" },
                          currency: { type: "string", example: "INR" },
                          planName: { type: "string" },
                          keyId: { type: "string", description: "Razorpay key ID for checkout" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "planId required" },
          },
        },
      },
      "/subscriptions/razorpay/verify": {
        post: {
          tags: ["Subscriptions"],
          summary: "Verify Razorpay payment and activate subscription",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["planId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"],
                  properties: {
                    planId: { type: "string", format: "cuid" },
                    razorpay_order_id: { type: "string" },
                    razorpay_payment_id: { type: "string" },
                    razorpay_signature: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Payment verified, subscription activated", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/SubscriptionStatus" } } } } } },
            400: { description: "Missing fields or signature verification failed" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // LANGUAGES (PUBLIC)
      // ═══════════════════════════════════════════════════════
      "/languages": {
        get: {
          tags: ["Languages"],
          summary: "List all active system languages",
          description: "Returns languages available for generation. Languages are admin-configurable.",
          security: [],
          responses: {
            200: {
              description: "Active languages",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/SystemLanguage" } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - CATEGORIES
      // ═══════════════════════════════════════════════════════
      "/admin/categories": {
        get: {
          tags: ["Admin - Categories"],
          summary: "List categories (admin)",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "isActive", in: "query", schema: { type: "boolean" } },
            { name: "parentId", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: { description: "Paginated category list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Category" } }, meta: { $ref: "#/components/schemas/PaginationMeta" } } } } } },
          },
        },
        post: {
          tags: ["Admin - Categories"],
          summary: "Create a new category",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "slug", "contentType"],
                  properties: {
                    name: { type: "string", minLength: 2, maxLength: 100 },
                    slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", description: "URL-friendly slug (lowercase, hyphens)" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    description: { type: "string", maxLength: 500 },
                    iconUrl: { type: "string", format: "uri" },
                    parentId: { type: "string", format: "cuid", nullable: true, description: "Parent category for subcategory hierarchy" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Category created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Category" } } } } } },
            422: { description: "Validation error" },
          },
        },
      },
      "/admin/categories/{id}": {
        get: {
          tags: ["Admin - Categories"],
          summary: "Get category by ID (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Category detail" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin - Categories"],
          summary: "Update category",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    slug: { type: "string" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    description: { type: "string" },
                    iconUrl: { type: "string" },
                    parentId: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated category" }, 404: { description: "Not found" } },
        },
        delete: {
          tags: ["Admin - Categories"],
          summary: "Delete category (fails if has templates or children)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" }, 400: { description: "Has templates or children" }, 404: { description: "Not found" } },
        },
      },
      "/admin/categories/{id}/fields": {
        post: {
          tags: ["Admin - Categories"],
          summary: "Add a field schema to a category",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["fieldKey", "label", "fieldType"],
                  properties: {
                    fieldKey: { type: "string", pattern: "^[a-z][a-z0-9_]*$", description: "snake_case identifier" },
                    label: { type: "string", minLength: 2, maxLength: 100 },
                    fieldType: { type: "string", enum: ["TEXT", "TEXTAREA", "IMAGE", "COLOR", "SELECT", "NUMBER", "PHONE", "EMAIL", "URL"] },
                    isRequired: { type: "boolean", default: false },
                    sortOrder: { type: "integer", default: 0 },
                    placeholder: { type: "string" },
                    defaultValue: { type: "string" },
                    hasPosition: { type: "boolean", default: false },
                    validation: {
                      type: "object",
                      properties: {
                        minLength: { type: "integer" },
                        maxLength: { type: "integer" },
                        pattern: { type: "string" },
                        options: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } } } },
                      },
                    },
                    displayConfig: {
                      type: "object",
                      properties: {
                        width: { type: "string", enum: ["full", "half"] },
                        helpText: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Field added" }, 409: { description: "Duplicate fieldKey" } },
        },
      },
      "/admin/categories/{id}/fields/{fieldId}": {
        patch: {
          tags: ["Admin - Categories"],
          summary: "Update a field schema",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "fieldId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Any subset of field schema properties",
                  properties: {
                    label: { type: "string" },
                    fieldType: { type: "string" },
                    isRequired: { type: "boolean" },
                    placeholder: { type: "string" },
                    hasPosition: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Field updated" }, 404: { description: "Not found" } },
        },
        delete: {
          tags: ["Admin - Categories"],
          summary: "Delete a field schema",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "fieldId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Field deleted" } },
        },
      },
      "/admin/categories/{id}/fields/reorder": {
        put: {
          tags: ["Admin - Categories"],
          summary: "Reorder field schemas in a category",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["fieldOrders"],
                  properties: {
                    fieldOrders: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "sortOrder"],
                        properties: {
                          id: { type: "string", format: "cuid" },
                          sortOrder: { type: "integer", minimum: 0 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Fields reordered" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - TEMPLATES
      // ═══════════════════════════════════════════════════════
      "/admin/templates": {
        get: {
          tags: ["Admin - Templates"],
          summary: "List templates (admin)",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "categoryId", in: "query", schema: { type: "string" } },
            { name: "isActive", in: "query", schema: { type: "boolean" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated template list" } },
        },
        post: {
          tags: ["Admin - Templates"],
          summary: "Create a new template with image upload",
          description: "Upload a template image (multipart form). Image is scanned for security, dimensions validated. Safe zones can be set later.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["image", "name", "contentType", "categoryId"],
                  properties: {
                    image: { type: "string", format: "binary" },
                    name: { type: "string", minLength: 2, maxLength: 200 },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    categoryId: { type: "string", format: "cuid" },
                    safeZones: { type: "string", description: "JSON-stringified array of safe zone objects" },
                    metadata: { type: "string", description: "JSON-stringified metadata object" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Template created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Template" } } } } } },
          },
        },
      },
      "/admin/templates/{id}": {
        get: {
          tags: ["Admin - Templates"],
          summary: "Get template by ID (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Template detail" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin - Templates"],
          summary: "Update template metadata (not image)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    categoryId: { type: "string" },
                    isActive: { type: "boolean" },
                    metadata: { type: "object" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
        },
        delete: {
          tags: ["Admin - Templates"],
          summary: "Delete template",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },
      "/admin/templates/{id}/safe-zones": {
        put: {
          tags: ["Admin - Templates"],
          summary: "Replace all safe zones for a template (creates layout history version)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["safeZones"],
                  properties: {
                    safeZones: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SafeZone" },
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Safe zones updated" } },
        },
      },
      "/admin/templates/{id}/image": {
        put: {
          tags: ["Admin - Templates"],
          summary: "Replace template image",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["image"],
                  properties: {
                    image: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Image replaced" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - FESTIVALS
      // ═══════════════════════════════════════════════════════
      "/admin/festivals": {
        get: {
          tags: ["Admin - Festivals"],
          summary: "List festivals (admin)",
          parameters: [
            { name: "contentType", in: "query", schema: { type: "string", enum: ["EVENT", "POSTER"] } },
            { name: "upcoming", in: "query", schema: { type: "boolean" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: { 200: { description: "Paginated festival list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Festival" } }, meta: { $ref: "#/components/schemas/PaginationMeta" } } } } } } },
        },
        post: {
          tags: ["Admin - Festivals"],
          summary: "Create a new festival",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "date", "contentType"],
                  properties: {
                    name: { type: "string", minLength: 2, maxLength: 200 },
                    description: { type: "string", maxLength: 500 },
                    date: { type: "string", format: "date", description: "Festival date (YYYY-MM-DD)" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    visibilityDays: { type: "integer", minimum: 1, maximum: 90, default: 7 },
                    metadata: {
                      type: "object",
                      properties: {
                        region: { type: "array", items: { type: "string" } },
                        religion: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                      },
                    },
                    categoryIds: {
                      type: "array",
                      items: { type: "string", format: "cuid" },
                      description: "Category IDs to promote during this festival",
                    },
                    promotionConfig: {
                      type: "array",
                      description: "Per-category promotion overrides (optional, used with categoryIds)",
                      items: {
                        type: "object",
                        required: ["categoryId"],
                        properties: {
                          categoryId: { type: "string", format: "cuid" },
                          sortOrder: { type: "integer", default: 0 },
                          promotionStartDays: { type: "integer", nullable: true, description: "Override festival visibilityDays for this category" },
                          promotionEndDays: { type: "integer", default: 1, description: "Days after festival to keep promoting" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Festival created with linked categories", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Festival" } } } } } } },
        },
      },
      "/admin/festivals/{id}": {
        get: {
          tags: ["Admin - Festivals"],
          summary: "Get festival by ID with promoted categories",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Festival detail with categories" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin - Festivals"],
          summary: "Update festival",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    date: { type: "string", format: "date" },
                    contentType: { type: "string", enum: ["EVENT", "POSTER"] },
                    visibilityDays: { type: "integer" },
                    isActive: { type: "boolean" },
                    metadata: { type: "object" },
                    categoryIds: { type: "array", items: { type: "string" }, description: "Replace all linked categories" },
                    promotionConfig: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
        },
        delete: {
          tags: ["Admin - Festivals"],
          summary: "Delete festival (cascades to FestivalCategory links)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },
      "/admin/festivals/{id}/categories": {
        put: {
          tags: ["Admin - Festivals"],
          summary: "Set promoted categories for a festival",
          description: "Replaces all category links. Send empty array to remove all.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["categories"],
                  properties: {
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["categoryId"],
                        properties: {
                          categoryId: { type: "string", format: "cuid" },
                          sortOrder: { type: "integer", default: 0 },
                          promotionStartDays: { type: "integer", nullable: true },
                          promotionEndDays: { type: "integer", default: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Categories linked" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - MODEL PRICING
      // ═══════════════════════════════════════════════════════
      "/admin/model-pricing": {
        get: {
          tags: ["Admin - Model Pricing"],
          summary: "List all model pricing configurations",
          responses: { 200: { description: "Model pricing list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/ModelPricing" } } } } } } } },
        },
        post: {
          tags: ["Admin - Model Pricing"],
          summary: "Create a model pricing entry",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["qualityTier", "providerName", "modelId", "creditCost"],
                  properties: {
                    qualityTier: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] },
                    providerName: { type: "string", maxLength: 50, example: "openai" },
                    modelId: { type: "string", maxLength: 100, example: "gpt-image-1" },
                    creditCost: { type: "integer", minimum: 1 },
                    priority: { type: "integer", minimum: 0, default: 0 },
                    config: { type: "object", description: "Provider config: quality, size, costCents, etc.", example: { quality: "medium", size: "1536x1024", costCents: 8 } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/admin/model-pricing/{id}": {
        patch: {
          tags: ["Admin - Model Pricing"],
          summary: "Update model pricing",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    creditCost: { type: "integer", minimum: 1 },
                    isActive: { type: "boolean" },
                    priority: { type: "integer" },
                    config: { type: "object" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated" } },
        },
        delete: {
          tags: ["Admin - Model Pricing"],
          summary: "Delete model pricing entry",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - SUBSCRIPTION PLANS
      // ═══════════════════════════════════════════════════════
      "/admin/subscription-plans": {
        get: {
          tags: ["Admin - Subscription Plans"],
          summary: "List all subscription plans",
          responses: { 200: { description: "Subscription plans", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/SubscriptionPlan" } } } } } } } },
        },
        post: {
          tags: ["Admin - Subscription Plans"],
          summary: "Create a subscription plan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "weeklyCredits", "tierAccess", "priceInr"],
                  properties: {
                    name: { type: "string", minLength: 2, maxLength: 100 },
                    appleProductId: { type: "string", nullable: true },
                    googleProductId: { type: "string", nullable: true },
                    weeklyCredits: { type: "integer", minimum: 1 },
                    tierAccess: { type: "array", items: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] }, minItems: 1 },
                    priceInr: { type: "integer", minimum: 0, description: "Price in paise (100 = ₹1)" },
                    sortOrder: { type: "integer", default: 0 },
                    features: { type: "array", items: { type: "string" }, nullable: true },
                    isActive: { type: "boolean", default: true },
                    createRazorpayPlan: { type: "boolean", description: "Auto-create Razorpay plan on creation" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Plan created" } },
        },
      },
      "/admin/subscription-plans/{id}": {
        get: {
          tags: ["Admin - Subscription Plans"],
          summary: "Get subscription plan by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Plan detail" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin - Subscription Plans"],
          summary: "Update subscription plan",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", description: "Any subset of plan fields" } } },
          },
          responses: { 200: { description: "Updated" } },
        },
        delete: {
          tags: ["Admin - Subscription Plans"],
          summary: "Delete subscription plan",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },
      "/admin/subscription-plans/{id}/razorpay-plan": {
        post: {
          tags: ["Admin - Subscription Plans"],
          summary: "Create Razorpay plan for an existing subscription plan",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Razorpay plan created and linked" },
            400: { description: "Razorpay plan already exists" },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - ANALYTICS
      // ═══════════════════════════════════════════════════════
      "/admin/analytics/dashboard": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get dashboard stats (8 key metrics)",
          responses: {
            200: {
              description: "Dashboard statistics",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/DashboardStats" } } } } },
            },
          },
        },
      },
      "/admin/analytics/trends": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get generation trends grouped by day and tier",
          parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 }, description: "Number of days to include" }],
          responses: {
            200: {
              description: "Daily generation trends",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/GenerationTrend" } } } } } },
            },
          },
        },
      },
      "/admin/analytics/costs": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get AI provider cost metrics and budget status",
          responses: {
            200: {
              description: "Cost metrics with tier status",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/CostMetrics" } } } } },
            },
          },
        },
      },
      "/admin/analytics/top-templates": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get most-used templates by generation count",
          responses: {
            200: {
              description: "Top templates",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            templateId: { type: "string" },
                            templateName: { type: "string" },
                            count: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/admin/analytics/failures": {
        get: {
          tags: ["Admin - Analytics"],
          summary: "Get recent failed generations",
          responses: {
            200: {
              description: "Recent failures",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Generation" } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - AUDIT LOGS
      // ═══════════════════════════════════════════════════════
      "/admin/audit-logs": {
        get: {
          tags: ["Admin - Audit"],
          summary: "List audit log entries with filters",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "userId", in: "query", schema: { type: "string" }, description: "Filter by user ID" },
            { name: "entity", in: "query", schema: { type: "string" }, description: "Filter by entity type (e.g. 'generation', 'template')" },
            { name: "action", in: "query", schema: { type: "string" }, description: "Filter by action (e.g. 'create', 'delete', 'moderation_block')" },
          ],
          responses: {
            200: {
              description: "Paginated audit logs",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } }, meta: { $ref: "#/components/schemas/PaginationMeta" } } } } },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - USERS
      // ═══════════════════════════════════════════════════════
      "/admin/users": {
        get: {
          tags: ["Admin - Users"],
          summary: "List users with filters",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "role", in: "query", schema: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] } },
            { name: "search", in: "query", schema: { type: "string" }, description: "Search by name or email" },
          ],
          responses: { 200: { description: "Paginated user list" } },
        },
      },
      "/admin/users/create-admin": {
        post: {
          tags: ["Admin - Users"],
          summary: "Create an admin account (SUPER_ADMIN only)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "name", "role"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8, description: "Must contain uppercase, lowercase, and a number" },
                    name: { type: "string", minLength: 2, maxLength: 100 },
                    phone: { type: "string" },
                    role: { type: "string", enum: ["ADMIN", "SUPER_ADMIN"] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Admin created" }, 409: { description: "Email already exists" } },
        },
      },
      "/admin/users/{id}/role": {
        patch: {
          tags: ["Admin - Users"],
          summary: "Update user role",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["role"],
                  properties: {
                    role: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Role updated" } },
        },
      },
      "/admin/users/{id}/toggle-active": {
        patch: {
          tags: ["Admin - Users"],
          summary: "Toggle user active/inactive status",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "User active status toggled" } },
        },
      },
      "/admin/users/{id}/toggle-generation": {
        patch: {
          tags: ["Admin - Users"],
          summary: "Toggle user's generation access (canGenerate flag)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Generation access toggled" } },
        },
      },
      "/admin/users/{id}/custom-role": {
        patch: {
          tags: ["Admin - Users"],
          summary: "Assign or remove custom role for a user (SUPER_ADMIN only)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["customRoleId"],
                  properties: {
                    customRoleId: { type: "string", nullable: true, description: "Custom role ID, or null to remove" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Custom role assigned" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - ROLES
      // ═══════════════════════════════════════════════════════
      "/admin/roles": {
        get: {
          tags: ["Admin - Roles"],
          summary: "List all custom roles",
          responses: { 200: { description: "Custom roles", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/CustomRole" } } } } } } } },
        },
        post: {
          tags: ["Admin - Roles"],
          summary: "Create a custom role (SUPER_ADMIN only)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "permissions"],
                  properties: {
                    name: { type: "string", minLength: 2, maxLength: 50 },
                    description: { type: "string", maxLength: 200 },
                    permissions: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      description: "Permission keys like 'categories.read', 'templates.write', etc.",
                      example: ["categories.read", "categories.write", "templates.read"],
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Role created" } },
        },
      },
      "/admin/roles/{id}": {
        get: {
          tags: ["Admin - Roles"],
          summary: "Get custom role by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Role detail" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin - Roles"],
          summary: "Update custom role (SUPER_ADMIN only)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    permissions: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated" } },
        },
        delete: {
          tags: ["Admin - Roles"],
          summary: "Delete custom role (SUPER_ADMIN only)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - GENERATIONS
      // ═══════════════════════════════════════════════════════
      "/admin/generations": {
        get: {
          tags: ["Admin - Generations"],
          summary: "List all generations (admin view with filters)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] } },
            { name: "qualityTier", in: "query", schema: { type: "string", enum: ["BASIC", "STANDARD", "PREMIUM"] } },
            { name: "provider", in: "query", schema: { type: "string" } },
            { name: "userId", in: "query", schema: { type: "string" }, description: "Filter by user" },
            { name: "batchId", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "Paginated generation history" } },
        },
      },
      "/admin/generations/stats": {
        get: {
          tags: ["Admin - Generations"],
          summary: "Get generation statistics summary",
          responses: { 200: { description: "Generation stats (counts by status, tier, provider)" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - SYSTEM CONFIG
      // ═══════════════════════════════════════════════════════
      "/admin/system-config": {
        get: {
          tags: ["Admin - System Config"],
          summary: "List all system config values",
          responses: { 200: { description: "System config entries", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/SystemConfig" } } } } } } } },
        },
      },
      "/admin/system-config/{key}": {
        patch: {
          tags: ["Admin - System Config"],
          summary: "Update a system config value (upsert)",
          description: "Allowed keys: daily_ai_budget_cents, cost_warning_threshold_percent, cost_critical_threshold_percent, cost_emergency_threshold_percent, daily_generation_cap, daily_generation_limit, concurrent_job_limit, maintenance_mode, default_quality_tier, max_batch_size",
          parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["value"],
                  properties: {
                    value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Config updated" }, 400: { description: "Invalid config key" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - LANGUAGES
      // ═══════════════════════════════════════════════════════
      "/admin/languages": {
        get: {
          tags: ["Admin - Languages"],
          summary: "List all system languages (including inactive)",
          responses: { 200: { description: "All languages", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/SystemLanguage" } } } } } } } },
        },
        post: {
          tags: ["Admin - Languages"],
          summary: "Create a new system language",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "label", "nativeLabel"],
                  properties: {
                    code: { type: "string", example: "TAMIL" },
                    label: { type: "string", example: "Tamil" },
                    nativeLabel: { type: "string", example: "தமிழ்" },
                    script: { type: "string", example: "Tamil" },
                    fontFamily: { type: "string" },
                    direction: { type: "string", enum: ["ltr", "rtl"], default: "ltr" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Language created" } },
        },
      },
      "/admin/languages/{id}": {
        patch: {
          tags: ["Admin - Languages"],
          summary: "Update a system language",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    nativeLabel: { type: "string" },
                    script: { type: "string" },
                    fontFamily: { type: "string" },
                    direction: { type: "string", enum: ["ltr", "rtl"] },
                    isActive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated" } },
        },
        delete: {
          tags: ["Admin - Languages"],
          summary: "Delete a system language",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // ADMIN - CREDENTIALS
      // ═══════════════════════════════════════════════════════
      "/admin/credentials": {
        get: {
          tags: ["Admin - Credentials"],
          summary: "List all credential keys with masked values and source (SUPER_ADMIN only)",
          responses: {
            200: {
              description: "Credentials list",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/CredentialInfo" } } } } } },
            },
          },
        },
      },
      "/admin/credentials/{key}": {
        put: {
          tags: ["Admin - Credentials"],
          summary: "Set a credential value (SUPER_ADMIN only)",
          parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["value"],
                  properties: {
                    value: { type: "string", maxLength: 10000 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Credential updated" }, 400: { description: "Invalid credential key" } },
        },
      },

      // ═══════════════════════════════════════════════════════
      // WEBHOOKS
      // ═══════════════════════════════════════════════════════
      "/webhooks/apple": {
        post: {
          tags: ["Webhooks"],
          summary: "Apple App Store Server Notifications V2",
          description: "Receives signed JWS payloads from Apple for subscription lifecycle events. Verified via JWS signature (no JWT auth). Always returns 200 after processing to prevent Apple retries.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["signedPayload"],
                  properties: {
                    signedPayload: { type: "string", description: "JWS-signed notification payload from Apple" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Webhook processed (always 200 to prevent Apple retries)" },
            400: { description: "Missing payload or JWS verification failed" },
          },
        },
      },
      "/webhooks/razorpay": {
        post: {
          tags: ["Webhooks"],
          summary: "Razorpay payment webhook",
          description: "Receives payment events from Razorpay. Verified via X-Razorpay-Signature header. Handles: payment.captured, payment.failed, refund.created.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Razorpay webhook event payload",
                },
              },
            },
          },
          responses: {
            200: { description: "Webhook acknowledged" },
            400: { description: "Invalid webhook signature" },
          },
        },
      },
    },
  },
  apis: [], // All paths defined inline above
};

export const swaggerSpec = swaggerJSDoc(options);
