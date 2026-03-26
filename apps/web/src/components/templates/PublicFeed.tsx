"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { getCountryFlag, getCountryName } from "@ep/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Globe, Sparkles, ChevronRight, X } from "lucide-react";

interface PublicGeneration {
  id: string;
  resultImageUrl: string | null;
  contentType: string;
  language: string;
  qualityTier: string;
  userName: string;
  categoryName: string;
  categoryId: string | null;
  templateName: string | null;
  createdAt: string;
}

export function PublicFeed({ contentType }: { contentType: "EVENT" | "POSTER" }) {
  const [generations, setGenerations] = useState<PublicGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewItem, setPreviewItem] = useState<PublicGeneration | null>(null);
  const { user } = useAuthStore();

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
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (generations.length === 0) {
    return null; // Don't show the section if no approved public generations exist
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Community Showcase</h2>
          {user?.country && (
            <Badge variant="outline" className="text-xs">
              <Globe className="mr-1 h-3 w-3" />
              {getCountryFlag(user.country)} {getCountryName(user.country)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {generations.length} creation{generations.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Horizontal scrollable grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {generations.map((gen) => (
          <div
            key={gen.id}
            className="group cursor-pointer overflow-hidden rounded-xl border bg-card transition-all hover:shadow-lg hover:scale-[1.02]"
            onClick={() => setPreviewItem(gen)}
          >
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {gen.resultImageUrl ? (
                <Image
                  src={gen.resultImageUrl}
                  alt={gen.templateName || "Community creation"}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <Sparkles className="h-8 w-8" />
                </div>
              )}

              {/* Overlay on hover */}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                <div className="w-full p-2">
                  <p className="truncate text-xs font-medium text-white">{gen.categoryName}</p>
                  <p className="text-[10px] text-white/70">by {gen.userName}</p>
                </div>
              </div>

              {/* Language badge */}
              <div className="absolute right-1.5 top-1.5">
                <Badge className="bg-black/50 text-[10px] text-white backdrop-blur-sm border-0">
                  {gen.language}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          {previewItem && (
            <>
              {/* Full image */}
              {previewItem.resultImageUrl && (
                <div className="relative aspect-square w-full bg-muted">
                  <Image
                    src={previewItem.resultImageUrl}
                    alt={previewItem.templateName || "Community creation"}
                    fill
                    className="object-contain"
                    sizes="(max-width: 576px) 100vw, 576px"
                  />
                </div>
              )}

              {/* Details */}
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{previewItem.categoryName}</p>
                    {previewItem.templateName && (
                      <p className="text-xs text-muted-foreground">{previewItem.templateName}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    by <span className="font-medium text-foreground">{previewItem.userName}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">{previewItem.language}</Badge>
                  <Badge variant="secondary" className="text-xs">{previewItem.qualityTier}</Badge>
                  <Badge variant="outline" className="text-xs">{previewItem.contentType}</Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
