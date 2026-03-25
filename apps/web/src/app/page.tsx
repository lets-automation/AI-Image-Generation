"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Always redirect to the main browse page — no auth check needed
    router.replace("/posters");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900">
      <Loader2 className="h-8 w-8 animate-spin text-white/60" />
    </div>
  );
}
