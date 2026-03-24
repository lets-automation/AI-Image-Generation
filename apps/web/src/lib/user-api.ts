import { apiClient } from "./api-client";
import type { ApiResponse, PaginationMeta } from "@ep/shared";

// ─── Types ──────────────────────────────────────────────

export interface TemplateItem {
  id: string;
  name: string;
  contentType: "EVENT" | "POSTER";
  imageUrl: string;
  width: number;
  height: number;
  isActive: boolean;
  usageCount: number;
  sortOrder: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface TemplateDetail extends TemplateItem {
  publicId: string;
  layoutVersion: number;
  safeZones: SafeZoneData[];
  metadata: Record<string, unknown> | null;
  category: {
    id: string;
    name: string;
    slug: string;
    contentType: "EVENT" | "POSTER";
    fieldSchemas: FieldSchemaItem[];
  };
}

export interface SafeZoneData {
  id: string;
  type: "text" | "logo" | "both";
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  maxFontSize?: number;
  position: string;
}

export interface FieldSchemaItem {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  sortOrder: number;
  placeholder: string | null;
  defaultValue: string | null;
  hasPosition: boolean;
  validation: Record<string, unknown> | null;
  displayConfig: Record<string, unknown> | null;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  contentType: "EVENT" | "POSTER";
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  parentId?: string | null;
  fieldSchemas: FieldSchemaItem[];
  children?: CategoryItem[];
  _count?: { templates: number };
  promoted?: boolean;
  festivalName?: string | null;
}

// ─── Category detail (with field schemas fetched separately) ─
export interface CategoryDetail extends CategoryItem {
  fieldSchemas: FieldSchemaItem[];
  templates: TemplateItem[];
}

export interface FestivalItem {
  id: string;
  name: string;
  description: string | null;
  date: string;
  contentType: "EVENT" | "POSTER";
  visibilityDays: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  promotedCategories?: Array<{
    id: string;
    categoryId: string;
    sortOrder: number;
    promotionStartDays: number | null;
    promotionEndDays: number;
    category: { id: string; name: string; slug: string; contentType: string };
  }>;
}

// ─── API calls ──────────────────────────────────────────

export const userApi = {
  // Templates
  listTemplates: async (params?: {
    page?: number;
    limit?: number;
    contentType?: "EVENT" | "POSTER";
    categoryId?: string;
    aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.contentType) query.set("contentType", params.contentType);
    if (params?.categoryId) query.set("categoryId", params.categoryId);
    if (params?.aspectRatio) query.set("aspectRatio", params.aspectRatio);
    if (params?.search) query.set("search", params.search);
    // Only show active templates for users
    query.set("isActive", "true");

    const { data } = await apiClient.get<
      ApiResponse<TemplateItem[]> & { meta: PaginationMeta }
    >(`/templates?${query.toString()}`);
    return {
      templates: data.data as TemplateItem[],
      meta: data.meta as PaginationMeta,
    };
  },

  getTemplate: async (id: string) => {
    const { data } = await apiClient.get<ApiResponse<TemplateDetail>>(
      `/templates/${id}`
    );
    return data.data as TemplateDetail;
  },

  listGroupedTemplates: async (params: {
    contentType: "EVENT" | "POSTER";
    aspectRatio?: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
  }) => {
    const query = new URLSearchParams();
    query.set("contentType", params.contentType);
    if (params.aspectRatio) query.set("aspectRatio", params.aspectRatio);

    const { data } = await apiClient.get<ApiResponse<CategoryDetail[]>>(
      `/templates/grouped?${query.toString()}`
    );
    return data.data as CategoryDetail[];
  },

  // Categories
  listCategories: async (contentType?: "EVENT" | "POSTER") => {
    const query = new URLSearchParams();
    if (contentType) query.set("contentType", contentType);
    query.set("isActive", "true");
    query.set("limit", "50");

    const { data } = await apiClient.get<ApiResponse<CategoryItem[]>>(
      `/categories?${query.toString()}`
    );
    return data.data as CategoryItem[];
  },

  getCategory: async (id: string) => {
    const { data } = await apiClient.get<ApiResponse<CategoryItem>>(
      `/categories/${id}`
    );
    return data.data as CategoryItem;
  },

  // Festivals
  listUpcomingFestivals: async (contentType?: "EVENT" | "POSTER") => {
    const query = contentType ? `?contentType=${contentType}` : "";
    const { data } = await apiClient.get<ApiResponse<FestivalItem[]>>(
      `/festivals/upcoming${query}`
    );
    return data.data as FestivalItem[];
  },
};
