export type { EnvConfig } from "../config/index.js";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(
  page = 1,
  limit = 20
): PaginationParams {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}
