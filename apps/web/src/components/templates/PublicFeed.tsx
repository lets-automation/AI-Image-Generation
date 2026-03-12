"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiClient } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

interface PublicGeneration {
  id: string;
  resultImageUrl: string;
  template?: {
    name: string;
    category?: { name: string };
  };
}

export function PublicFeed({ contentType }: { contentType: "EVENT" | "POSTER" }) {
  const [generations, setGenerations] = useState<PublicGeneration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPublic() {
      try {
        const { data } = await apiClient.get(
          `/generations/public?contentType=${contentType}&limit=12`
        );
        setGenerations(data.data || []);
      } catch (err) {
        console.error("Failed to fetch public generations:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPublic();
  }, [contentType]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center text-muted-foreground">
        <p className="text-sm font-medium">No community generations yet</p>
        <p className="mt-1 text-xs">Check back later for beautiful {contentType.toLowerCase()}s created by our community.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {generations.map((gen) => (
        <div key={gen.id} className="group overflow-hidden rounded-xl border bg-card transition-all hover:shadow-md">
          <div className="relative aspect-square w-full overflow-hidden bg-muted">
            <Image
              src={gen.resultImageUrl}
              alt={gen.template?.name || "Generated Image"}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </div>
          {(gen.template?.name || gen.template?.category?.name) && (
            <div className="p-3">
              {gen.template?.name && (
                <p className="truncate text-sm font-semibold">{gen.template.name}</p>
              )}
              {gen.template?.category?.name && (
                <p className="text-xs text-muted-foreground">{gen.template.category.name}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
