"use client";

import { create } from "zustand";
import {
  userApi,
  type TemplateItem,
  type CategoryItem,
  type CategoryDetail,
  type FestivalItem,
} from "@/lib/user-api";
import type { PaginationMeta } from "@ep/shared";

interface BrowseState {
  // Templates
  templates: TemplateItem[];
  meta: PaginationMeta | null;
  isLoading: boolean;

  // Filters
  contentType: "EVENT" | "POSTER";
  categoryId: string | null;
  aspectRatio: "SQUARE" | "PORTRAIT" | "LANDSCAPE" | null;
  page: number;
  searchQuery: string;

  // Reference data
  categories: CategoryItem[];
  groupedCategories: CategoryDetail[];
  festivals: FestivalItem[];
  categoriesLoaded: boolean;
  festivalsLoaded: boolean;

  // Actions
  setContentType: (type: "EVENT" | "POSTER") => void;
  setCategoryId: (id: string | null) => void;
  setAspectRatio: (ratio: "SQUARE" | "PORTRAIT" | "LANDSCAPE" | null) => void;
  setPage: (page: number) => void;
  fetchTemplates: () => Promise<void>;
  fetchGroupedCategories: () => Promise<void>;
  fetchCategories: (contentType: "EVENT" | "POSTER") => Promise<void>;
  fetchFestivals: (contentType: "EVENT" | "POSTER") => Promise<void>;
  reset: () => void;
}

export const useBrowseStore = create<BrowseState & { searchQuery: string; setSearchQuery: (query: string) => void }>((set, get) => ({
  templates: [],
  meta: null,
  isLoading: false,

  contentType: "EVENT",
  categoryId: null,
  aspectRatio: null,
  page: 1,
  searchQuery: "",

  categories: [],
  groupedCategories: [],
  festivals: [],
  categoriesLoaded: false,
  festivalsLoaded: false,

  setContentType: (type) => set({ contentType: type, categoryId: null, page: 1, searchQuery: "", categoriesLoaded: false, festivalsLoaded: false }),
  setCategoryId: (id) => set({ categoryId: id, page: 1, searchQuery: "" }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio, page: 1, templates: [], groupedCategories: [] }),
  setPage: (page) => set({ page }),
  setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),

  fetchTemplates: async () => {
    const { contentType, categoryId, aspectRatio, page, searchQuery } = get();
    set({ isLoading: true });
    try {
      const result = await userApi.listTemplates({
        contentType,
        categoryId: categoryId ?? undefined,
        aspectRatio: aspectRatio ?? undefined,
        search: searchQuery || undefined,
        page,
        limit: 20,
      });
      set({
        templates: result.templates,
        meta: result.meta,
        isLoading: false,
      });
    } catch {
      set({ templates: [], isLoading: false });
    }
  },

  fetchGroupedCategories: async () => {
    const { contentType, aspectRatio } = get();
    set({ isLoading: true });
    try {
      const groupedCategories = await userApi.listGroupedTemplates({
        contentType,
        aspectRatio: aspectRatio ?? undefined,
      });
      set({ groupedCategories, isLoading: false });
    } catch {
      set({ groupedCategories: [], isLoading: false });
    }
  },

  fetchCategories: async (contentType) => {
    try {
      const categories = await userApi.listCategories(contentType);
      set({ categories, categoriesLoaded: true });
    } catch {
      set({ categories: [], categoriesLoaded: true });
    }
  },

  fetchFestivals: async (contentType) => {
    try {
      const festivals = await userApi.listUpcomingFestivals(contentType);
      set({ festivals, festivalsLoaded: true });
    } catch {
      set({ festivals: [], festivalsLoaded: true });
    }
  },

  reset: () =>
    set({
      templates: [],
      meta: null,
      categoryId: null,
      aspectRatio: null,
      page: 1,
      searchQuery: "",
      categories: [],
      groupedCategories: [],
      festivals: [],
      categoriesLoaded: false,
      festivalsLoaded: false,
    }),
}));
