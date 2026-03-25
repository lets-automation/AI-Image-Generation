"use client";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useOptionalAuth } from "@/hooks/useAuth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useOptionalAuth();

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-16 md:pb-0">
      <Header />
      <Sidebar />
      <main className="md:ml-60">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
