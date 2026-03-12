"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function StatusBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        active
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

interface ContentTypeBadgeProps {
  type: "EVENT" | "POSTER";
}

export function ContentTypeBadge({ type }: ContentTypeBadgeProps) {
  return (
    <Badge variant="outline" className="font-medium">
      {type}
    </Badge>
  );
}
