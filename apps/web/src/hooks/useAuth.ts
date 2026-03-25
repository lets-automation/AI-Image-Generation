"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

const adminRoutePermissions: Record<string, string> = {
  "/admin/analytics": "analytics.read",
  "/admin/templates": "templates.read",
  "/admin/categories": "categories.read",
  "/admin/festivals": "festivals.read",
  "/admin/pricing": "subscriptions.read",
  "/admin/models": "models.read",
  "/admin/moderation": "moderation.read",
  "/admin/users": "users.read",
  "/admin/settings": "system.config",
  "/admin": "dashboard.read", 
};

/**
 * Hook to protect client-side routes.
 * Redirects to /login if not authenticated.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { isAuthenticated, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  return { isReady: isInitialized && isAuthenticated };
}

/**
 * Hook for pages that allow unauthenticated access.
 * Initializes auth (restores session if available) but does NOT redirect.
 */
export function useOptionalAuth() {
  const { isAuthenticated, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return { isReady: isInitialized, isAuthenticated };
}

/**
 * Hook to protect admin routes.
 * Redirects to /events if not admin.
 */
export function useRequireAdmin() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isInitialized) {
      if (!isAuthenticated) {
        router.replace("/login");
        return;
      } 
      
      const isSuperAdmin = user?.role === "SUPER_ADMIN";
      const isSystemAdmin = user?.role === "ADMIN";
      const hasCustomRole = !!user?.customRole;

      if (!isSuperAdmin && !isSystemAdmin && !hasCustomRole) {
        // Normal user trying to access admin
        router.replace("/events");
        return;
      }

      // If user has a custom role, we need to check if they have permission for the current path
      if (hasCustomRole && !isSuperAdmin) {
        const permissions = user.customRole?.permissions || [];
        if (permissions.includes("ALL_ACCESS")) return; // Overrides everything

        // Sort keys by length descending to match most specific route first (e.g. /admin/users before /admin)
        const sortedRoutes = Object.keys(adminRoutePermissions).sort((a, b) => b.length - a.length);
        
        const matchingRoute = sortedRoutes.find(route => 
          pathname === route || pathname.startsWith(`${route}/`)
        );

        if (matchingRoute) {
          const requiredPermission = adminRoutePermissions[matchingRoute];
          if (!permissions.includes(requiredPermission)) {
            // They don't have permission for this specific admin page.
            // Automatically find the first page they DO have access to.
            // We reverse the array to prioritize deeper dashboard tabs over empty ones if navigating blindly
            const firstAllowedRoute = sortedRoutes.reverse().find(route => permissions.includes(adminRoutePermissions[route]));
            
            if (firstAllowedRoute) {
              router.replace(firstAllowedRoute);
            } else {
              router.replace("/events"); // Absolutely no admin permissions found
            }
          }
        }
      }
    }
  }, [isInitialized, isAuthenticated, user, pathname, router]);

  const isAdmin =
    user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || !!user?.customRole;

  return { isReady: isInitialized && isAuthenticated && isAdmin };
}
