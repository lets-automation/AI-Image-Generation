"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, User, LogIn, Coins } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { status, fetchStatus } = useSubscriptionStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  const balance = status?.balance;

  const getTitle = () => {
    if (pathname.includes("/posters")) return "Posters";
    if (pathname.includes("/events")) return "Events";
    if (pathname.includes("/downloads")) return "Downloads";
    if (pathname.includes("/status")) return "Status";
    return "Dashboard";
  };

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: Hamburger */}
        <button className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full md:hidden">
          <Menu className="h-6 w-6" strokeWidth={2} />
        </button>
        <Link href="/" className="hidden md:block text-xl font-bold text-black hover:text-gray-900">
          EP Product
        </Link>

        {/* Center: Title (Mobile only) */}
        <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {getTitle()}
          </h1>
        </div>

        {/* Right: Icons or Login/SignUp */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {balance && (
                <Link
                  href="/subscription"
                  className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  <Coins className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold">{balance.remainingCredits}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-500">{balance.weeklyCredits}</span>
                </Link>
              )}
              <Link href="/profile" className="text-gray-600 hover:text-gray-900">
                <User className="h-5 w-5" strokeWidth={2} />
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                <LogIn className="h-4 w-4" />
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
