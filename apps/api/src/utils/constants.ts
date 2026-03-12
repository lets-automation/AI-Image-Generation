/** Cookie names */
export const COOKIE_REFRESH_TOKEN = "ep_refresh_token";

/** Header names */
export const HEADER_IDEMPOTENCY_KEY = "idempotency-key";

/** Redis key prefixes */
export const REDIS_KEYS = {
  RATE_LIMIT: "rl:",
  COST_DAILY: "cost:daily:",
  GENERATION_STATUS: "gen:status:",
  CIRCUIT_BREAKER: "cb:",
  GENERATION_CACHE: "gen:cache:",
} as const;

/** Queue names */
export const QUEUE_NAMES = {
  GENERATION: "generation",
  CLEANUP: "cleanup",
} as const;
