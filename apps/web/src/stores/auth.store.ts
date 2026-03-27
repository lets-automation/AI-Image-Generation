"use client";

import { create } from "zustand";
import type { UserProfile, AuthResponse } from "@ep/shared";
import { apiClient, setAccessToken } from "@/lib/api-client";

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (credential: string, country?: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<UserProfile>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;

    const refreshToken =
      typeof window !== "undefined"
        ? localStorage.getItem("ep_refresh_token")
        : null;

    if (!refreshToken) {
      set({ isInitialized: true });
      return;
    }

    try {
      set({ isLoading: true });

      // Try to refresh the token
      const { data: refreshData } = await apiClient.post("/auth/refresh", {
        refreshToken,
      });

      const tokens = refreshData.data.tokens;
      setAccessToken(tokens.accessToken);
      localStorage.setItem("ep_refresh_token", tokens.refreshToken);

      // Fetch user profile
      const { data: meData } = await apiClient.get("/auth/me");

      set({
        user: meData.data,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
      });
    } catch {
      // Clear invalid tokens
      setAccessToken(null);
      localStorage.removeItem("ep_refresh_token");
      set({
        user: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
      });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.post<{ data: AuthResponse }>(
        "/auth/login",
        { email, password }
      );

      const { user, tokens } = data.data;
      setAccessToken(tokens.accessToken);
      localStorage.setItem("ep_refresh_token", tokens.refreshToken);

      set({
        user,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  googleLogin: async (credential: string, country?: string) => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.post<{ data: AuthResponse }>(
        "/auth/google",
        { credential, country }
      );

      const { user, tokens } = data.data;
      setAccessToken(tokens.accessToken);
      localStorage.setItem("ep_refresh_token", tokens.refreshToken);

      set({
        user,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (input) => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.post<{ data: AuthResponse }>(
        "/auth/register",
        input
      );

      const { user, tokens } = data.data;
      setAccessToken(tokens.accessToken);
      localStorage.setItem("ep_refresh_token", tokens.refreshToken);

      set({
        user,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem("ep_refresh_token");
    try {
      if (refreshToken) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    } catch {
      // Ignore logout errors
    } finally {
      setAccessToken(null);
      localStorage.removeItem("ep_refresh_token");
      set({
        user: null,
        isAuthenticated: false,
      });
    }
  },

  updateUser: (partial) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...partial } });
    }
  },
}));
