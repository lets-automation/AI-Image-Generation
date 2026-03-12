"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, User, Crown } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const { user } = useAuthStore();

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

        {/* Right: Icons */}
        <div className="flex items-center gap-3">
          <Link href="/profile" className="text-gray-600 hover:text-gray-900">
            <User className="h-5 w-5" strokeWidth={2} />
          </Link>
          <Link href="/subscription" className="flex items-center justify-center p-1 rounded-full bg-yellow-50 text-yellow-500 hover:bg-yellow-100">
            <Crown className="h-5 w-5 fill-yellow-400 text-yellow-500" />
          </Link>
        </div>
      </div>
    </header>
  );
}
