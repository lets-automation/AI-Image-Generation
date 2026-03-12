"use client";

import { ReactNode } from "react";
import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
      <div className="mb-4 text-muted-foreground/60">
        {icon || <InboxIcon className="h-10 w-10" />}
      </div>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground/70">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
