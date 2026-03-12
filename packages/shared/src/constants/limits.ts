/** Rate limiting defaults */
export const RATE_LIMITS = {
  GLOBAL_PER_MIN: 100,
  AUTH_PER_MIN: 10,
  GENERATION_PER_MIN: 5,
  UPLOAD_PER_MIN: 10,
} as const;

/** Upload constraints */
export const UPLOAD_LIMITS = {
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_LOGO_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_FORMATS: ["image/jpeg", "image/png", "image/webp"] as const,
  ALLOWED_LOGO_FORMATS: ["image/png", "image/svg+xml", "image/webp"] as const,
} as const;

/** Generation constraints */
export const GENERATION_LIMITS = {
  MAX_PROMPT_LENGTH: 500,
  MIN_PROMPT_LENGTH: 0,
  MAX_FIELD_VALUE_LENGTH: 200,
  MAX_PHONE_LENGTH: 15,
  MAX_CONCURRENT_JOBS_PER_USER: 3,
  DAILY_GENERATION_CAP_DEFAULT: 50,
  COOLDOWN_SECONDS: 10,
} as const;

/** Image output */
export const IMAGE_OUTPUT = {
  DEFAULT_WIDTH: 1080,
  DEFAULT_HEIGHT: 1080,
  PREVIEW_SCALE: 0.25,
  SUPPORTED_FORMATS: ["png", "jpg", "webp"] as const,
  DEFAULT_FORMAT: "png" as const,
  JPEG_QUALITY: 90,
  WEBP_QUALITY: 85,
} as const;

/** Idempotency */
export const IDEMPOTENCY = {
  KEY_TTL_SECONDS: 3600, // 1 hour
  HEADER_NAME: "Idempotency-Key" as const,
} as const;

/** Circuit breaker */
export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  FAILURE_WINDOW_MS: 60_000,
  OPEN_DURATION_MS: 30_000,
  HALF_OPEN_MAX_REQUESTS: 1,
} as const;

/** Cost guardrails */
export const COST_GUARDRAILS = {
  WARNING_THRESHOLD_PERCENT: 70,
  CRITICAL_THRESHOLD_PERCENT: 90,
  EMERGENCY_THRESHOLD_PERCENT: 100,
} as const;

/** Subscription constraints */
export const SUBSCRIPTION_LIMITS = {
  MIN_CREDITS_PER_PLAN: 1,
  MAX_CREDITS_PER_PLAN: 1000,
  GRACE_PERIOD_DAYS: 16,
  BILLING_RETRY_DAYS: 60,
  CACHE_STATUS_TTL_SECONDS: 60,
  CACHE_BALANCE_TTL_SECONDS: 30,
} as const;
