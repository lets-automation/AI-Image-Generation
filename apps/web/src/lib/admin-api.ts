import { apiClient } from "./api-client";
import type { ApiResponse } from "@ep/shared";

// ─── Generic helpers ──────────────────────────────────────

async function get<T>(url: string): Promise<T> {
  const { data } = await apiClient.get<ApiResponse<T>>(url);
  return data.data as T;
}

async function getPaginated<T>(url: string): Promise<{ data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const { data } = await apiClient.get(url);
  return { data: data.data, meta: data.meta };
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.post<ApiResponse<T>>(url, body);
  return data.data as T;
}

async function patch<T>(url: string, body: unknown): Promise<T> {
  const { data } = await apiClient.patch<ApiResponse<T>>(url, body);
  return data.data as T;
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const { data } = await apiClient.put<ApiResponse<T>>(url, body);
  return data.data as T;
}

async function del(url: string): Promise<void> {
  await apiClient.delete(url);
}

// ─── Users ──────────────────────────────────────────────

export interface UserData {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  customRoleId: string | null;
  isActive: boolean;
  canGenerate: boolean;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  _count?: { generations: number };
}

// ─── Custom Roles ──────────────────────────────────────────

export interface CustomRoleData {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  _count?: { users: number };
}

// ─── Subscription Plans ──────────────────────────────────

export interface SubscriptionPlanData {
  id: string;
  name: string;
  appleProductId: string | null;
  googleProductId: string | null;
  razorpayPlanId: string | null;
  weeklyCredits: number;
  tierAccess: string[];
  priceInr: number;
  isActive: boolean;
  sortOrder: number;
  features: string[] | null;
  _count?: { subscriptions: number };
}

// ─── Categories ───────────────────────────────────────────

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  contentType: string;
  description: string | null;
  iconUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  fieldSchemas: FieldSchemaData[];
  parent?: { id: string; name: string; slug: string } | null;
  children?: CategoryData[];
  _count?: { templates: number; children: number };
}

export interface FieldSchemaData {
  id: string;
  categoryId: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  sortOrder: number;
  placeholder: string | null;
  defaultValue: string | null;
  hasPosition: boolean;
  isRepeatable: boolean;
  maxRepeat: number;
  groupKey: string | null;
  validation: unknown;
  displayConfig: unknown;
}

// ─── Generation History ──────────────────────────────────

export interface GenerationHistoryItem {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
  template: { id: string; name: string; imageUrl: string } | null;
  contentType: string;
  qualityTier: string;
  language: string;
  orientation: string | null;
  status: string;
  creditCost: number;
  processingMs: number | null;
  providerUsed: string | null;
  aiCostCents: number | null;
  effectiveTier: string | null;
  modelId: string | null;
  resultImageUrl: string | null;
  errorMessage: string | null;
  batchId: string | null;
  createdAt: string;
}

export interface GenerationStats {
  total: number;
  completed: number;
  failed: number;
  successRate: string;
  avgProcessingMs: number;
  byTier: Array<{ tier: string; count: number }>;
  last24h: number;
}

export const adminApi = {
  // Categories
  listCategories: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
    return get<CategoryData[]>(`/admin/categories${qs ? `?${qs}` : ""}`);
  },
  getCategory: (id: string) => get<CategoryData>(`/admin/categories/${id}`),
  createCategory: (body: unknown) =>
    post<CategoryData>("/admin/categories", body),
  updateCategory: (id: string, body: unknown) =>
    patch<CategoryData>(`/admin/categories/${id}`, body),
  deleteCategory: (id: string) => del(`/admin/categories/${id}`),

  // Field Schemas
  addField: (categoryId: string, body: unknown) =>
    post<FieldSchemaData>(`/admin/categories/${categoryId}/fields`, body),
  updateField: (categoryId: string, fieldId: string, body: unknown) =>
    patch<FieldSchemaData>(
      `/admin/categories/${categoryId}/fields/${fieldId}`,
      body
    ),
  deleteField: (categoryId: string, fieldId: string) =>
    del(`/admin/categories/${categoryId}/fields/${fieldId}`),
  reorderFields: (categoryId: string, fieldOrders: { id: string; sortOrder: number }[]) =>
    put<FieldSchemaData[]>(
      `/admin/categories/${categoryId}/fields/reorder`,
      { fieldOrders }
    ),

  // Templates
  listTemplates: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
    return get<unknown[]>(`/admin/templates${qs ? `?${qs}` : ""}`);
  },
  getTemplate: (id: string) => get<unknown>(`/admin/templates/${id}`),
  createTemplate: (formData: FormData) =>
    apiClient
      .post("/admin/templates", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.data),
  updateTemplate: (id: string, body: unknown) =>
    patch<unknown>(`/admin/templates/${id}`, body),
  updateSafeZones: (id: string, safeZones: unknown[]) =>
    put<unknown>(`/admin/templates/${id}/safe-zones`, { safeZones }),
  replaceTemplateImage: (id: string, formData: FormData) =>
    apiClient
      .put(`/admin/templates/${id}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.data),
  deleteTemplate: (id: string) => del(`/admin/templates/${id}`),

  // Festivals
  listFestivals: (params?: string) =>
    get<unknown[]>(`/admin/festivals${params ? `?${params}` : ""}`),
  createFestival: (body: unknown) => post<unknown>("/admin/festivals", body),
  updateFestival: (id: string, body: unknown) =>
    patch<unknown>(`/admin/festivals/${id}`, body),
  deleteFestival: (id: string) => del(`/admin/festivals/${id}`),
  setFestivalCategories: (id: string, categories: Array<{ categoryId: string; sortOrder?: number; promotionStartDays?: number | null; promotionEndDays?: number }>) =>
    put<unknown>(`/admin/festivals/${id}/categories`, { categories }),

  // Model Pricing
  listModelPricing: (tier?: string) =>
    get<unknown[]>(`/admin/model-pricing${tier ? `?tier=${tier}` : ""}`),
  createModelPricing: (body: unknown) =>
    post<unknown>("/admin/model-pricing", body),
  updateModelPricing: (id: string, body: unknown) =>
    patch<unknown>(`/admin/model-pricing/${id}`, body),
  deleteModelPricing: (id: string) => del(`/admin/model-pricing/${id}`),

  // Subscription Plans
  listSubscriptionPlans: () =>
    get<SubscriptionPlanData[]>("/admin/subscription-plans"),
  createSubscriptionPlan: (body: unknown) =>
    post<SubscriptionPlanData>("/admin/subscription-plans", body),
  updateSubscriptionPlan: (id: string, body: unknown) =>
    patch<SubscriptionPlanData>(`/admin/subscription-plans/${id}`, body),
  deleteSubscriptionPlan: (id: string) =>
    del(`/admin/subscription-plans/${id}`),
  createRazorpayPlan: (id: string) =>
    post<SubscriptionPlanData>(`/admin/subscription-plans/${id}/razorpay-plan`),

  // Audit Logs
  listAuditLogs: (params?: string) =>
    get<unknown[]>(`/admin/audit-logs${params ? `?${params}` : ""}`),

  // User Management
  listUsers: (params?: string) => {
    const ts = `t=${Date.now()}`;
    const qs = params ? `${params}&${ts}` : ts;
    return getPaginated<UserData>(`/admin/users?${qs}`);
  },
  updateUserRole: (id: string, role: string) =>
    patch<UserData>(`/admin/users/${id}/role`, { role }),
  toggleUserActive: (id: string) =>
    patch<UserData>(`/admin/users/${id}/toggle-active`, {}),
  toggleGenerationAccess: (id: string) =>
    patch<UserData>(`/admin/users/${id}/toggle-generation`, {}),
  createAdmin: (body: { email: string; password: string; name: string; phone?: string; role: string }) =>
    post<UserData>("/admin/users/create-admin", body),
  assignCustomRole: (userId: string, customRoleId: string | null) =>
    patch<UserData>(`/admin/users/${userId}/custom-role`, { customRoleId }),

  // Custom Roles
  listRoles: () => get<CustomRoleData[]>("/admin/roles"),
  getRole: (id: string) => get<CustomRoleData>(`/admin/roles/${id}`),
  createRole: (body: { name: string; description?: string; permissions: string[] }) =>
    post<CustomRoleData>("/admin/roles", body),
  updateRole: (id: string, body: { name?: string; description?: string; permissions?: string[] }) =>
    patch<CustomRoleData>(`/admin/roles/${id}`, body),
  deleteRole: (id: string) => del(`/admin/roles/${id}`),

  // Generation History
  listGenerations: (params?: string) =>
    getPaginated<GenerationHistoryItem>(`/admin/generations${params ? `?${params}` : ""}`),
  getGenerationStats: () =>
    get<GenerationStats>("/admin/generations/stats"),

  // System Config
  listSystemConfig: () =>
    get<Array<{ id: string; key: string; value: unknown }>>("/admin/system-config"),
  updateSystemConfig: (key: string, value: string | number | boolean) =>
    patch<{ id: string; key: string; value: unknown }>(`/admin/system-config/${key}`, { value }),

  // Languages
  listLanguages: () =>
    get<Array<{ id: string; code: string; label: string; nativeLabel: string; script: string; fontFamily: string; direction: string; isActive: boolean; sortOrder: number }>>("/admin/languages"),
  createLanguage: (body: { code: string; label: string; nativeLabel: string; script?: string; fontFamily?: string; direction?: string }) =>
    post<{ id: string; code: string; label: string }>("/admin/languages", body),
  updateLanguage: (id: string, body: Partial<{ label: string; nativeLabel: string; script: string; fontFamily: string; direction: string; isActive: boolean; sortOrder: number }>) =>
    patch<{ id: string }>(`/admin/languages/${id}`, body),
  deleteLanguage: (id: string) =>
    del(`/admin/languages/${id}`),

  // Credentials (SUPER_ADMIN)
  getCredentials: () =>
    get<Array<{ key: string; label: string; group: string; maskedValue: string; source: "db" | "env" | "not_set" }>>("/admin/credentials"),
  updateCredential: (key: string, value: string) =>
    apiClient.put(`/admin/credentials/${key}`, { value }).then((r) => r.data),

  // Showcase Management
  listShowcaseRequests: (params?: { page?: number; limit?: number; status?: string; contentType?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.contentType) qs.set("contentType", params.contentType);
    const query = qs.toString();
    return getPaginated<ShowcaseRequestData>(`/admin/showcase${query ? `?${query}` : ""}`);
  },
  getShowcaseCounts: () =>
    get<{ pending: number; approved: number; rejected: number; total: number }>("/admin/showcase/counts"),
  reviewShowcase: (id: string, body: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string; categoryId?: string; targetCountries?: string[] }) =>
    post<ShowcaseRequestData>(`/admin/showcase/${id}/review`, body),
};

export interface ShowcaseRequestData {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userCountry: string | null;
  resultImageUrl: string | null;
  contentType: "EVENT" | "POSTER";
  language: string;
  qualityTier: "BASIC" | "STANDARD" | "PREMIUM";
  categoryName: string;
  categoryId: string | null;
  showcaseStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  showcaseCategoryId: string | null;
  showcaseCategoryName: string | null;
  showcaseTargetCountries: string[] | null;
  showcaseRejectionReason: string | null;
  showcaseReviewedAt: string | null;
  createdAt: string;
}
