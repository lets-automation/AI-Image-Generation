"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { LANGUAGE_CONFIGS } from "@ep/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, CheckCircle2, XCircle, Download, Maximize2, X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

export interface BatchResult {
  id: string;
  language: string;
  status: string;
  resultImageUrl: string | null;
}

// Language display priority: English first, then alphabetical
const LANGUAGE_DISPLAY_ORDER = [
  "ENGLISH", "HINDI", "ARABIC", "CHINESE", "FRENCH",
  "GERMAN", "JAPANESE", "KOREAN", "PORTUGUESE", "SPANISH",
];

export function sortByLanguageOrder(results: BatchResult[]): BatchResult[] {
  return [...results].sort((a, b) => {
    const ai = LANGUAGE_DISPLAY_ORDER.indexOf(a.language);
    const bi = LANGUAGE_DISPLAY_ORDER.indexOf(b.language);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// ─── Processing View ─────────────────────────────────────

export function ProcessingView({
  batchId,
  onComplete,
  onError,
}: {
  batchId: string;
  onComplete: (results: BatchResult[]) => void;
  onError: (msg: string) => void;
}) {
  const [progress, setProgress] = useState(5);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(10);
  const [liveResults, setLiveResults] = useState<BatchResult[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await apiClient.get(`/generations/batch/${batchId}`);
        const batch = data.data;
        if (batch) {
          setTotal(batch.total);
          setCompleted(batch.completed);
          setProgress(batch.progress);
          setLiveResults(sortByLanguageOrder(batch.generations));
          if (batch.status === "COMPLETED" || (batch.completed + batch.failed === batch.total)) {
            clearInterval(interval);
            onComplete(batch.generations);
          } else if (batch.status === "FAILED" && batch.failed === batch.total) {
            clearInterval(interval);
            onError("All generations failed. Your credits have been refunded.");
          }
        }
      } catch {
        // retry on next poll
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [batchId, onComplete, onError]);

  const completedResults = liveResults.filter((r) => r.status === "COMPLETED" && r.resultImageUrl);

  return (
    <div className="py-8">
      <div className="flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="mt-4 text-lg font-semibold">
          Generating in {total} Language{total !== 1 ? "s" : ""}...
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {completed} of {total} completed
        </p>
        <div className="mt-4 w-full max-w-xs">
          <Progress value={progress} className="h-2" />
          <p className="mt-1 text-center text-xs text-muted-foreground">{progress}%</p>
        </div>
      </div>

      {/* Show images progressively as they complete */}
      {completedResults.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
            Ready so far:
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completedResults.map((r) => {
              const langCfg = LANGUAGE_CONFIGS[r.language as keyof typeof LANGUAGE_CONFIGS];
              return (
                <div key={r.id} className="overflow-hidden rounded-lg border animate-in fade-in-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.resultImageUrl!} alt={langCfg?.label ?? r.language} className="h-auto w-full" />
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{langCfg?.label ?? r.language}</p>
                      <p className="text-xs text-muted-foreground">{langCfg?.nativeLabel}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Ready</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Result View ─────────────────────────────────────────

export function ResultView({
  results,
  error,
}: {
  results: BatchResult[];
  error: string | null;
}) {
  const router = useRouter();
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; label: string } | null>(null);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <XCircle className="h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-lg font-semibold">Generation Failed</h2>
        <p className="mt-1 text-sm text-destructive">{error}</p>
        <p className="mt-1 text-xs text-muted-foreground">Your credits have been refunded.</p>
        <Button className="mt-6" onClick={() => router.push("/events")}>
          Back to Events
        </Button>
      </div>
    );
  }

  if (results.length > 0) {
    const sorted = sortByLanguageOrder(results);
    const completedResults = sorted.filter((r) => r.status === "COMPLETED" && r.resultImageUrl);
    const failedResults = sorted.filter((r) => r.status === "FAILED");

    return (
      <div className="py-8">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h2 className="mt-3 text-lg font-semibold">Your Creatives are Ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {completedResults.length} of {sorted.length} generated successfully
            {failedResults.length > 0 && ` (${failedResults.length} failed)`}
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => {
            const langCfg = LANGUAGE_CONFIGS[r.language as keyof typeof LANGUAGE_CONFIGS];
            return (
              <div key={r.id} className="overflow-hidden rounded-lg border">
                {r.status === "COMPLETED" && r.resultImageUrl ? (
                  <>
                    <div className="group relative cursor-pointer" onClick={() => setFullscreenImage({ url: r.resultImageUrl!, label: langCfg?.label ?? r.language })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.resultImageUrl} alt={langCfg?.label ?? r.language} className="h-auto w-full" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                        <Maximize2 className="h-6 w-6 text-white drop-shadow-lg" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{langCfg?.label ?? r.language}</p>
                        <p className="text-xs text-muted-foreground">{langCfg?.nativeLabel}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setFullscreenImage({ url: r.resultImageUrl!, label: langCfg?.label ?? r.language })}>
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.resultImageUrl} target="_blank" rel="noopener noreferrer" download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center bg-muted/30">
                    <XCircle className="h-6 w-6 text-destructive" />
                    <p className="mt-2 text-sm font-medium">{langCfg?.label ?? r.language}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push("/downloads")}>
            My Downloads
          </Button>
          <Button variant="outline" onClick={() => router.push("/events")}>
            Generate Another
          </Button>
        </div>

        {/* Fullscreen Image Viewer */}
        {fullscreenImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setFullscreenImage(null)}
          >
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fullscreenImage.url}
                alt={fullscreenImage.label}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
                <span className="rounded-lg bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
                  {fullscreenImage.label}
                </span>
                <a
                  href={fullscreenImage.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-gray-900 shadow-lg transition-colors hover:bg-gray-100"
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
