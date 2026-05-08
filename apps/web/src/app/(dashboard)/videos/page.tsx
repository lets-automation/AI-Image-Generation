"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { videoApi, videoThumbnailUrl, type VideoGenerationItem } from "@/lib/video-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Video as VideoIcon,
  Plus,
  Sparkles,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export default function VideosPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [videos, setVideos] = useState<VideoGenerationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    videoApi
      .list({ page, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setVideos(res.videos);
        setTotalPages(res.meta?.totalPages ?? 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.error?.message ??
            err?.response?.data?.message ??
            "Failed to load videos. Please try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, page]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <div className="rounded-2xl border bg-card p-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <VideoIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bring your images to life
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to turn your photos into 15- or 30-second cinematic videos
            powered by Seedance 2.0.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button onClick={() => router.push("/login")}>Sign in</Button>
            <Button variant="outline" onClick={() => router.push("/register")}>
              Create account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Image-to-video generation powered by Seedance 2.0. Pick a tier,
            describe the motion, get a cinematic clip back.
          </p>
        </div>
        <Button asChild>
          <Link href="/videos/new" className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Create video
          </Link>
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 px-8 py-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">No videos yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Upload an image, describe what should happen, and Seedance will animate
        it into a 15- or 30-second video.
      </p>
      <Button asChild className="mt-5">
        <Link href="/videos/new" className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" />
          Create your first video
        </Link>
      </Button>
    </div>
  );
}

function VideoCard({ video }: { video: VideoGenerationItem }) {
  const isProcessing = video.status === "QUEUED" || video.status === "PROCESSING";
  const isFailed = video.status === "FAILED" || video.status === "CANCELLED";
  const isComplete = video.status === "COMPLETED" && video.resultVideoUrl;

  const thumb = videoThumbnailUrl(video.resultVideoUrl);

  // Detail page handles all states (queued/processing/completed/failed) with one code path
  const detailHref = `/videos/${video.id}`;

  return (
    <Link
      href={detailHref}
      className={cn(
        "group block overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/40 hover:shadow-md"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {isComplete && thumb ? (
          <Image
            src={thumb}
            alt={video.prompt ?? "Video"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : isComplete && video.resultVideoUrl ? (
          <video
            src={video.resultVideoUrl}
            className="h-full w-full object-cover"
            muted
            preload="metadata"
          />
        ) : isFailed ? (
          <div className="flex h-full items-center justify-center text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Generating…</span>
          </div>
        )}
        {video.videoDurationSec && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Clock className="h-3 w-3" />
            {video.videoDurationSec}s
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          {video.prompt || "Untitled video"}
        </p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {video.qualityTier} · {video.videoResolution === "P1080" ? "1080p" : "720p"}
          </span>
          <span>{formatRelativeTime(video.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
