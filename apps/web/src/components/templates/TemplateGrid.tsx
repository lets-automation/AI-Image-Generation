"use client";

import { TemplateCard } from "./TemplateCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";
import type { TemplateItem } from "@/lib/user-api";
import type { PaginationMeta } from "@ep/shared";

interface TemplateGridProps {
  templates: TemplateItem[];
  meta: PaginationMeta | null;
  loading: boolean;
  contentType: "EVENT" | "POSTER";
  onPageChange: (page: number) => void;
}

export function TemplateGrid({
  templates,
  meta,
  loading,
  contentType,
  onPageChange,
}: TemplateGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon className="mb-4 h-14 w-14 text-muted-foreground/40" />
        <h3 className="text-lg font-medium">
          No templates found
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try selecting a different category or check back later.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            contentType={contentType}
          />
        ))}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(meta.page - 1)}
            disabled={meta.page <= 1}
          >
            Previous
          </Button>

          {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
            .filter((p) => {
              return (
                p === 1 ||
                p === meta.totalPages ||
                Math.abs(p - meta.page) <= 2
              );
            })
            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                acc.push("...");
              }
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === "..." ? (
                <span key={`dots-${idx}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === meta.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(p)}
                  className="h-8 w-8 p-0"
                >
                  {p}
                </Button>
              )
            )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(meta.page + 1)}
            disabled={meta.page >= meta.totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
