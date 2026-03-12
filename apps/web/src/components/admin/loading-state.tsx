"use client";

import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/60" />
      <p className="mt-3 text-sm text-muted-foreground/70">{message}</p>
    </div>
  );
}
