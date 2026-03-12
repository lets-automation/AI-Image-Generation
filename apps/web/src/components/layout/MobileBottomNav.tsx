"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Film, Calendar, Image as ImageIcon, Download } from "lucide-react";

const navItems = [
    {
        label: "Status",
        href: "/status", // Disabled/Mock route as per requirements
        icon: Film,
    },
    {
        label: "Events",
        href: "/events",
        icon: Calendar,
    },
    {
        label: "Posters",
        href: "/posters",
        icon: ImageIcon,
    },
    {
        label: "Download",
        href: "/downloads",
        icon: Download,
    },
];

export function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 w-full items-center justify-around border-t border-gray-200 bg-white pb-safe md:hidden">
            {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 w-full h-full",
                            isActive ? "text-gray-900" : "text-gray-400"
                        )}
                        onClick={(e) => {
                            if (item.href === "/status") {
                                e.preventDefault(); // Disable status link for now
                            }
                        }}
                    >
                        <Icon className="h-6 w-6" strokeWidth={isActive ? 2 : 1.5} />
                        <span className={cn("text-[10px]", isActive ? "font-medium" : "")}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
