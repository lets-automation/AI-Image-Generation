import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default("2h"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),

  // AI Providers
  OPENAI_API_KEY: z.string().default(""),
  IDEOGRAM_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().default(3),
  WORKER_MAX_MEMORY_MB: z.coerce.number().default(512),

  // Apple App Store
  APPLE_KEY_ID: z.string().default(""),
  APPLE_ISSUER_ID: z.string().default(""),
  APPLE_BUNDLE_ID: z.string().default(""),
  APPLE_PRIVATE_KEY: z.string().default(""),           // PEM-encoded ES256 key
  APPLE_ENVIRONMENT: z.enum(["Sandbox", "Production"]).default("Sandbox"),

  // Razorpay (Web payments)
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),     // For webhook signature verification

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default(""),

  // Rate Limiting
  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().default(100),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_GENERATION_PER_MIN: z.coerce.number().default(5),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Log field names and validation messages only — never log actual env values
    const fieldErrors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("Invalid environment configuration. Fix these fields:");
    for (const err of fieldErrors) console.error(`  - ${err}`);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
