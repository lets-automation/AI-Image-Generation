"use client";

import type { FestivalItem } from "@/lib/user-api";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface FestivalBannerProps {
  festivals: FestivalItem[];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function FestivalBanner({ festivals }: FestivalBannerProps) {
  if (festivals.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 p-[1px]">
      <div className="rounded-[11px] bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-orange-500" />
          Upcoming Festivals
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {festivals.map((festival) => {
            const days = daysUntil(festival.date);
            const isPast = days < 0;
            const isToday = days === 0;

            return (
              <div
                key={festival.id}
                className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5"
              >
                <span className="text-sm font-medium">
                  {festival.name}
                </span>
                <Badge
                  variant={isToday ? "default" : isPast ? "secondary" : days <= 3 ? "warning" : "default"}
                  className="text-[10px]"
                >
                  {isToday
                    ? "Today!"
                    : isPast
                      ? "Ongoing"
                      : `in ${days} day${days === 1 ? "" : "s"}`}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
