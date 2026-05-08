"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useAuth";
import { useGenerationStatus } from "@/hooks/useGenerationStatus";
import { videoApi, type VideoGenerationItem } from "@/lib/video-api";
import { VIDEO_TIER_CONFIGS } from "@ep/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Loader2,
  Download as DownloadIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video as VideoIcon,
  Sparkles,
} from "lucide-react";

/**
 * Detail / status view for a single video generation.
 *
 * Handles all four states with one code path:
 *   QUEUED / PROCESSING → progress bar driven by SSE
 *   COMPLETED           → playable result + download
 *   FAILED / CANCELLED  → error + retry CTA
 *
 * Subscribes to the same status stream the image flow uses, so any pipeline
 * status update (Redis pub/sub or DB polling) flows through here.
 */

/**
 * Detect Seedance's "real person in image" moderation rejection. The exact
 * upstream wording is "input image may contain real person" — we match
 * loosely so wording tweaks on BytePlus's side don't break the hint.
 */
function isRealPersonBlock(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("real person") || m.includes("contain person");
}
export default function VideoDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  useRequireAuth();

  const id = params?.id;
  const [item, setItem] = useState<VideoGenerationItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Initial fetch — gives us tier/duration metadata that the SSE doesn't carry.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    videoApi
      .getById(id)
      .then((res) => {
        if (cancelled) return;
        setItem(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err?.response?.data?.message ?? "Failed to load video. Please try again."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Live status stream — only attaches when we actually need updates.
  const isInProgress =
    item?.status === "QUEUED" || item?.status === "PROCESSING";
  const { status: liveStatus } = useGenerationStatus(
    isInProgress && id ? id : null
  );

  // Merge live status into the cached item so the UI updates without
  // re-fetching the full record on every tick.
  const effectiveStatus = liveStatus?.status ?? item?.status;
  const effectiveProgress = liveStatus?.progress ?? null;
  const effectiveStep = liveStatus?.step ?? null;
  const effectiveResultVideoUrl =
    liveStatus?.resultVideoUrl ?? item?.resultVideoUrl ?? null;
  const effectiveError = liveStatus?.errorMessage ?? item?.errorMessage ?? null;

  // When the stream tells us the job finished, refresh the item once so we
  // pick up server-set fields (resultVideoPublicId, processingMs, etc.).
  useEffect(() => {
    if (!id) return;
    if (effectiveStatus === "COMPLETED" || effectiveStatus === "FAILED") {
      videoApi
        .getById(id)
        .then(setItem)
        .catch(() => {
          /* keep last known state */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus, id]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button asChild className="mt-5" variant="outline">
            <Link href="/videos">Back to videos</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="aspect-video w-full rounded-2xl" />
      </div>
    );
  }

  const tierConfig = VIDEO_TIER_CONFIGS[item.qualityTier];

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Videos
        </Button>
      </div>

      <div className="mb-5 space-y-1">
        <h1 className="line-clamp-2 text-xl font-semibold leading-tight">
          {item.prompt || "Untitled video"}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            {tierConfig.label} · {tierConfig.variant}
          </span>
          <span className="inline-flex items-center gap-1">
            <VideoIcon className="h-3.5 w-3.5" />
            {tierConfig.resolution}
          </span>
          {item.videoDurationSec && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {item.videoDurationSec}s
            </span>
          )}
          <span>{item.creditCost} credits</span>
        </div>
      </div>

      {effectiveStatus === "COMPLETED" && effectiveResultVideoUrl && (
        <div className="space-y-4">
          {item.partial && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    Partial result —{" "}
                    {item.requestedDurationSec ?? 30}s requested,{" "}
                    {item.videoDurationSec ?? 15}s delivered
                  </p>
                  <p className="text-amber-900/80">
                    {isRealPersonBlock(item.partialReason ?? "")
                      ? "Seedance's content filter rejected the bridge frame between the two clips (it can flag its own intermediate output as a real person). Your first 15-second clip is below."
                      : "The second clip couldn't be generated, so we delivered the first one. Your video is below."}
                  </p>
                  {item.refundedCredits ? (
                    <p className="text-xs text-amber-900/70">
                      You were charged {item.creditCost} credits for what you got;{" "}
                      {item.refundedCredits} credits have been refunded.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border bg-card">
            <video
              src={effectiveResultVideoUrl}
              controls
              autoPlay
              loop
              className="aspect-video w-full bg-black"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {item.partial ? "Partial result ready" : "Ready"}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a href={effectiveResultVideoUrl} download>
                  <DownloadIcon className="mr-1.5 h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button asChild>
                <Link href="/videos/new">Create another</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {(effectiveStatus === "QUEUED" || effectiveStatus === "PROCESSING") && (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold">Generating your video</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This typically takes 1–4 minutes. You can leave the page — the
            video will appear in your Videos list when it's ready.
          </p>

          <div className="mx-auto mt-6 max-w-md">
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
                style={{
                  width: `${Math.max(2, Math.min(100, effectiveProgress ?? 5))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {effectiveStep || (effectiveStatus === "QUEUED" ? "Queued" : "Working…")}
            </p>
          </div>
        </div>
      )}

      {(effectiveStatus === "FAILED" ||
        effectiveStatus === "CANCELLED" ||
        effectiveStatus === "TIMEOUT") && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" />
          <h2 className="text-lg font-semibold">Generation failed</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            {effectiveError ??
              "Something went wrong. Your credits have been refunded — please try again."}
          </p>

          {effectiveError && isRealPersonBlock(effectiveError) && (
            <div className="mx-auto mt-4 max-w-md rounded-md border border-amber-300/60 bg-amber-50 p-3 text-left text-xs text-amber-900">
              <p className="font-semibold">Why this was blocked</p>
              <p className="mt-1">
                Seedance&apos;s content policy refuses uploads that look like a
                real, identifiable person&apos;s face — this is enforced by the
                provider, not by us.
              </p>
              <p className="mt-2 font-semibold">What works instead</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>Illustrations, paintings, or stylized cartoon characters</li>
                <li>AI-generated faces (e.g., from gpt-image-2 or Midjourney)</li>
                <li>Photos cropped so the face isn&apos;t visible (back, silhouette)</li>
                <li>Animals, products, landscapes, or objects</li>
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Credits ({item.creditCost}) have been refunded to your balance.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/videos")}>
              Back to videos
            </Button>
            <Button asChild>
              <Link href="/videos/new">Try again</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
