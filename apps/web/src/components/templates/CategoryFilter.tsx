"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame } from "lucide-react";
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

  // Categories come pre-sorted from API (promoted first)
  const hasPromoted = categories.some((c) => c.promoted);

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
            "snap-start whitespace-nowrap flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition flex items-center gap-1.5",
            selectedId === cat.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : cat.promoted
                ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {cat.promoted && (
            <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
          )}
          {cat.name}
          {cat._count?.templates != null && (
            <span className="ml-1 text-xs opacity-70">
              ({cat._count.templates})
            </span>
          )}
        </button>
      ))}
      {hasPromoted && (
        <div className="snap-start flex-shrink-0 flex items-center pl-1 pr-2">
          <span className="text-[10px] text-orange-500/60 whitespace-nowrap">
            Festival picks
          </span>
        </div>
      )}
    </div>
  );
}
