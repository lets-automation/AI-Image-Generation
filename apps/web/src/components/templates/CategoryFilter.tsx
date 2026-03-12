"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryItem } from "@/lib/user-api";

interface CategoryFilterProps {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  loading?: boolean;
}

export function CategoryFilter({
  categories,
  selectedId,
  onSelect,
  loading,
}: CategoryFilterProps) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex snap-x overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "snap-start whitespace-nowrap flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
          selectedId === null
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            "snap-start whitespace-nowrap flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
            selectedId === cat.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {cat.name}
          {cat._count?.templates != null && (
            <span className="ml-1.5 text-xs opacity-70">
              ({cat._count.templates})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
