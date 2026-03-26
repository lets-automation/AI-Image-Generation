"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { LimelightNav } from "@/components/ui/limelight-nav";
import {
  LayoutDashboard,
  BarChart3,
  Image,
  FolderTree,
  CalendarDays,
  Coins,
  Cpu,
  Shield,
  Users,
  Settings,
  ArrowLeft,
  Globe,
  Sparkles,
} from "lucide-react";

const adminRoutes = [
  { href: "/admin", icon: <LayoutDashboard />, label: "Dashboard", permission: "dashboard.read" },
  { href: "/admin/analytics", icon: <BarChart3 />, label: "Analytics", permission: "analytics.read" },
  { href: "/admin/templates", icon: <Image />, label: "Templates", permission: "templates.read" },
  { href: "/admin/categories", icon: <FolderTree />, label: "Categories", permission: "categories.read" },
  { href: "/admin/languages", icon: <Globe />, label: "Languages", permission: "languages.read" },
  { href: "/admin/festivals", icon: <CalendarDays />, label: "Festivals", permission: "festivals.read" },
  { href: "/admin/pricing", icon: <Coins />, label: "Pricing", permission: "subscriptions.read" },
  { href: "/admin/models", icon: <Cpu />, label: "AI Models", permission: "models.read" },
  { href: "/admin/showcase", icon: <Sparkles />, label: "Showcase", permission: "showcase.read" },
  { href: "/admin/moderation", icon: <Shield />, label: "Moderation", permission: "moderation.read" },
  { href: "/admin/users", icon: <Users />, label: "Users", permission: "users.read" },
  { href: "/admin/settings", icon: <Settings />, label: "Settings", permission: "system.config" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const permissions = user?.customRole?.permissions || [];

  const visibleRoutes = adminRoutes.filter((route) => {
    // Super admins see everything
    if (isSuperAdmin) return true;
    
    // Regular admins might be restricted by standard logic, but let's assume they see all or are migrated to custom roles.
    // Dashboard is usually visible to all admins.
    if (!route.permission) return true;

    // Check custom role permissions if present
    if (user?.customRole) {
      return permissions.includes(route.permission) || permissions.includes("ALL_ACCESS");
    }

    // Default admin fallback
    return user?.role === "ADMIN";
  });

  const activeIndex = visibleRoutes.findIndex((route) =>
    route.href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(route.href)
  );

  const navItems = visibleRoutes.map((route) => ({
    id: route.href,
    icon: route.icon,
    label: route.label,
    onClick: () => router.push(route.href),
  }));

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-center justify-center gap-4 px-4 sm:px-6 py-2">
        <LimelightNav
          items={navItems}
          activeIndex={activeIndex === -1 ? 0 : activeIndex}
        />
        <Link
          href="/events"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Exit</span>
        </Link>
      </div>
    </div>
  );
}
