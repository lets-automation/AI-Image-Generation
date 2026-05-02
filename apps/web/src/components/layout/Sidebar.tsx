"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import {
  Calendar,
  ImageIcon,
  Download,
  CreditCard,
  UserRound,
  Settings,
  LogIn,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const publicNavItems: NavItem[] = [
  { label: "Events", href: "/events", icon: Calendar },
  { label: "Posters", href: "/posters", icon: ImageIcon },
];

const authNavItems: NavItem[] = [
  { label: "Downloads", href: "/downloads", icon: Download },
  { label: "Subscription", href: "/subscription", icon: CreditCard },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin =
    user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || !!user?.customRole;

  const browseItems = publicNavItems;
  const personalItems = isAuthenticated ? authNavItems : [];

  return (
    <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-60 border-r border-gray-200 bg-white md:block">
      <nav className="flex h-full flex-col px-3 py-4">
        <NavSection label="Browse" items={browseItems} pathname={pathname} />

        {personalItems.length > 0 && (
          <NavSection
            label="My account"
            items={personalItems}
            pathname={pathname}
            className="mt-5"
          />
        )}

        {isAdmin && (
          <NavSection
            label="Admin"
            items={[{ label: "Admin Panel", href: "/admin", icon: Settings }]}
            pathname={pathname}
            className="mt-5"
          />
        )}

        {!isAuthenticated && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              <LogIn className="h-4 w-4" />
              Login / Sign Up
            </Link>
            <p className="mt-2 px-1 text-[11px] leading-snug text-gray-400">
              Sign in to generate creatives, save downloads, and manage your subscription.
            </p>
          </div>
        )}
      </nav>
    </aside>
  );
}

function NavSection({
  label, items, pathname, className,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gray-900" />
                )}
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                    isActive ? "text-gray-900" : "text-gray-400 group-hover:text-gray-700"
                  )}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
