import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiResponse } from "@ep/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// ─── Token management ───────────────────────────────────
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ─── Request interceptor — attach Bearer token ──────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor — handle 401 + token refresh ──
let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  pendingRequests = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Avoid infinite loops on refresh endpoint
    if (originalRequest.url?.includes("/auth/refresh")) {
      setAccessToken(null);
      // Clear stored refresh token
      if (typeof window !== "undefined") {
        localStorage.removeItem("ep_refresh_token");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue requests while refreshing
      return new Promise((resolve, reject) => {
        pendingRequests.push({
          resolve: (token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshToken =
        typeof window !== "undefined"
          ? localStorage.getItem("ep_refresh_token")
          : null;

      if (!refreshToken) {
        throw new Error("No refresh token");
      }

      const { data } = await axios.post<ApiResponse<{ tokens: { accessToken: string; refreshToken: string } }>>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken }
      );

      const newTokens = data.data?.tokens;
      if (!newTokens) throw new Error("Invalid refresh response");

      setAccessToken(newTokens.accessToken);
      if (typeof window !== "undefined") {
        localStorage.setItem("ep_refresh_token", newTokens.refreshToken);
      }

      processQueue(null, newTokens.accessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("ep_refresh_token");
        // Only redirect to login if user is on an auth-required page
        // (not on public browse pages like /posters, /events, /)
        const publicPaths = ["/", "/posters", "/events", "/login", "/register"];
        const currentPath = window.location.pathname;
        const isPublicPage = publicPaths.some(
          (p) => currentPath === p || currentPath.startsWith(p + "/")
        );
        if (!isPublicPage) {
          window.location.href = "/login";
        }
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
