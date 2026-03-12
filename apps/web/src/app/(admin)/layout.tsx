"use client";

import { Header } from "@/components/layout/Header";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { useRequireAdmin } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useRequireAdmin();

  if (!isReady) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased">
      <Header />
      <AdminSidebar />
      <main>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
