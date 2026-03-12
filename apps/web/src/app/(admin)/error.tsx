"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-foreground">Admin Panel Error</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {error.message || "Something went wrong in the admin panel."}
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset}>
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/admin")}
          >
            Admin Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
