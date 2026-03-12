"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  description?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  variant?: "default" | "warning" | "danger";
}

export function StatCard({
  label,
  value,
  icon,
  description,
  trend,
  variant = "default",
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "transition-colors duration-200",
        variant === "warning" && "border-amber-500/20",
        variant === "danger" && "border-red-500/20"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.direction === "up"
                  ? "text-emerald-400"
                  : "text-red-400"
              )}
            >
              {trend.direction === "up" ? "+" : "-"}
              {trend.value}%
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
