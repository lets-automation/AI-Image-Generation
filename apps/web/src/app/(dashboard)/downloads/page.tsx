"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { useRequireAuth } from "@/hooks/useAuth";
import { ImageUploadCard } from "@/components/templates/ImageUploadCard";

interface DownloadItem {
  id: string;
  generationId: string;
  format: string;
  resolution: string;
  downloadedAt: string;
  generation: {
    id: string;
    status: string;
    qualityTier: string;
    language: string;
    contentType: string;
    resultImageUrl: string | null;
    prompt: string;
    createdAt: string;
  } | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface GenerationItem {
  id: string;
  status: string;
  qualityTier: string;
  language: string;
  contentType: string;
  creditCost: number;
  resultImageUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * Inject Cloudinary delivery transforms into the URL so the browser
 * receives a crisp, retina-aware version. Non-Cloudinary URLs pass through.
 *
 *   - f_auto      → format negotiation (AVIF/WebP/JPEG)
 *   - q_auto:best → highest auto quality
 *   - dpr_auto    → device-pixel-ratio aware (Retina / 4K screens)
 *   - c_limit     → never upscale, only constrain max width
 */
function cloudinaryOptimize(url: string | null, maxWidth = 1600): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  if (/\/upload\/[^/]*(f_auto|q_auto|dpr_auto)/.test(url)) return url; // already transformed
  return url.replace(
    "/upload/",
    `/upload/f_auto,q_auto:best,dpr_auto,c_limit,w_${maxWidth}/`
  );
}

export default function DownloadsPage() {
  const { isReady } = useRequireAuth();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [generations, setGenerations] = useState<GenerationItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"generations" | "downloads">("generations");
  const [lightbox, setLightbox] = useState<{ url: string; gen?: GenerationItem; dl?: DownloadItem } | null>(null);

  const fetchGenerations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await apiClient.get("/generations", {
        params: { page, limit: 12 },
      });
      setGenerations(data.data ?? []);
      setMeta(data.meta ?? null);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  const fetchDownloads = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await apiClient.get("/downloads", {
        params: { page, limit: 12 },
      });
      setDownloads(data.data ?? []);
      setMeta(data.meta ?? null);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (tab === "generations") {
      fetchGenerations();
    } else {
      fetchDownloads();
    }
  }, [tab, fetchGenerations, fetchDownloads]);

  const handleDownload = async (generationId: string) => {
    try {
      const { data } = await apiClient.post("/downloads", { generationId });
      if (data.data?.downloadUrl) {
        window.open(data.data.downloadUrl, "_blank");
        if (tab === "downloads") fetchDownloads();
      }
    } catch {
      // Ignore
    }
  };

  if (!isReady) return null;

  return (
    <div className="relative">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          My Creatives
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-gray-500">
          A gallery of every poster you&apos;ve generated — view in full quality and re-download anytime.
        </p>
      </header>

      {/* Custom upload CTA */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <ImageUploadCard contentType="EVENT" variant="horizontal" />
      </div>

      {/* Tabs */}
      <div className="mb-8 inline-flex items-center gap-1 rounded-2xl border border-gray-200/70 bg-white/70 p-1.5 shadow-sm backdrop-blur-md">
        <TabButton active={tab === "generations"} onClick={() => { setTab("generations"); setPage(1); }}>
          <GalleryIcon className="h-4 w-4" />
          All Generations
        </TabButton>
        <TabButton active={tab === "downloads"} onClick={() => { setTab("downloads"); setPage(1); }}>
          <DownloadIcon className="h-4 w-4" />
          Downloads
        </TabButton>
      </div>

      {isLoading ? (
        <ShimmerGrid />
      ) : tab === "generations" ? (
        generations.length === 0 ? (
          <EmptyState
            title="No generations yet"
            subtitle="Pick a template or upload your photo — your first masterpiece is one click away."
            icon={<GalleryIcon className="h-7 w-7 text-gray-500" />}
          />
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
            {generations.map((gen) => (
              <GenerationCard
                key={gen.id}
                gen={gen}
                onView={(url) => setLightbox({ url, gen })}
                onDownload={() => handleDownload(gen.id)}
              />
            ))}
          </div>
        )
      ) : downloads.length === 0 ? (
        <EmptyState
          title="No downloads yet"
          subtitle="Once you save a creative, it'll appear here for one-click re-download."
          icon={<DownloadIcon className="h-7 w-7 text-gray-500" />}
        />
      ) : (
        <DownloadsTable
          downloads={downloads}
          onView={(url, dl) => setLightbox({ url, dl })}
          onRedownload={handleDownload}
        />
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="group flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:shadow-sm"
          >
            <ArrowIcon className="h-3.5 w-3.5 rotate-180 transition-transform group-enabled:group-hover:-translate-x-0.5" />
            Previous
          </button>
          <span className="rounded-lg bg-gray-100/70 px-3 py-1.5 text-xs font-medium text-gray-600">
            Page <span className="font-bold text-gray-900">{page}</span> of {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="group flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:shadow-sm"
          >
            Next
            <ArrowIcon className="h-3.5 w-3.5 transition-transform group-enabled:group-hover:translate-x-0.5" />
          </button>
        </div>
      )}

      {/* Premium Lightbox */}
      {lightbox && (
        <Lightbox
          url={lightbox.url}
          gen={lightbox.gen}
          dl={lightbox.dl}
          onClose={() => setLightbox(null)}
          onDownload={() => {
            if (lightbox.gen) handleDownload(lightbox.gen.id);
            else if (lightbox.dl) handleDownload(lightbox.dl.generationId);
          }}
        />
      )}
    </div>
  );
}

/* ─── SUB-COMPONENTS ─────────────────────────────────────────── */

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? "bg-gray-900 text-white shadow-sm"
          : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function GenerationCard({
  gen, onView, onDownload,
}: {
  gen: GenerationItem;
  onView: (url: string) => void;
  onDownload: () => void;
}) {
  const optimizedUrl = cloudinaryOptimize(gen.resultImageUrl, 800);
  const isReady = gen.status === "COMPLETED" && gen.resultImageUrl;
  const isProcessing = gen.status === "PROCESSING" || gen.status === "QUEUED";

  return (
    <div className="group relative">
      <article className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 group-hover:shadow-lg">
        {/* Image */}
        <div className="relative aspect-[4/5] overflow-hidden bg-gray-50">
          {isReady ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizedUrl ?? undefined}
                alt="Generated creative"
                loading="lazy"
                decoding="async"
                className="relative h-full w-full select-none object-cover"
              />
              {/* Top tier overlay */}
              <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                <TierChip tier={gen.qualityTier} />
              </div>
              {/* Hover overlay actions */}
              <div className="absolute inset-0 flex items-end justify-stretch bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <div className="flex w-full items-center gap-2 p-3">
                  <button
                    onClick={() => onView(gen.resultImageUrl!)}
                    className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow transition-colors hover:bg-gray-50"
                  >
                    <EyeIcon className="mr-1 inline h-3.5 w-3.5" /> View
                  </button>
                  <button
                    onClick={onDownload}
                    className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-gray-800"
                  >
                    <DownloadIcon className="mr-1 inline h-3.5 w-3.5" /> Save
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              {isProcessing ? (
                <>
                  <div className="relative h-10 w-10">
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary-500/30" />
                    <div className="absolute inset-1 animate-spin rounded-full border-[3px] border-primary-500 border-t-transparent" />
                  </div>
                  <p className="text-center text-xs font-medium text-gray-500">
                    {gen.status === "QUEUED" ? "Queued for generation" : "Crafting your creative…"}
                  </p>
                </>
              ) : gen.status === "FAILED" ? (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                    <AlertIcon className="h-5 w-5 text-red-500" />
                  </div>
                  <p className="text-center text-xs font-medium text-red-500">Generation failed</p>
                </>
              ) : (
                <ImageIcon className="h-10 w-10 text-gray-300" />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="space-y-2 p-3.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{relativeTime(gen.createdAt)}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                {gen.contentType}
              </span>
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-600">
                {gen.language}
              </span>
            </div>
          </div>
          {process.env.NODE_ENV === "development" && gen.errorMessage && (
            <p className="line-clamp-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
              {gen.errorMessage}
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

function DownloadsTable({
  downloads, onView, onRedownload,
}: {
  downloads: DownloadItem[];
  onView: (url: string, dl: DownloadItem) => void;
  onRedownload: (genId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200/80 bg-gradient-to-r from-gray-50 via-white to-gray-50">
              <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Preview</th>
              <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Creative</th>
              <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Format</th>
              <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Date</th>
              <th className="px-5 py-3.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {downloads.map((dl) => {
              const url = dl.generation?.resultImageUrl ?? null;
              const optimized = cloudinaryOptimize(url, 200);
              return (
                <tr key={dl.id} className="group transition-colors hover:bg-gray-50/60">
                  <td className="px-5 py-3">
                    <button
                      onClick={() => url && onView(url, dl)}
                      className="relative block h-14 w-14 overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200 transition-shadow hover:ring-gray-300"
                      disabled={!url}
                    >
                      {optimized ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={optimized}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <p className="line-clamp-1 max-w-md text-sm font-medium text-gray-900">
                      {dl.generation?.prompt ?? "—"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {dl.generation && <TierChip tier={dl.generation.qualityTier} compact />}
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-600">
                        {dl.generation?.language}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-gray-700">
                        {dl.format}
                      </span>
                      <span className="text-xs text-gray-500">{dl.resolution}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {new Date(dl.downloadedAt).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {url && (
                      <button
                        onClick={() => onRedownload(dl.generationId)}
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
                      >
                        <DownloadIcon className="h-3 w-3" />
                        Re-download
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Lightbox({
  url, gen, dl, onClose, onDownload,
}: {
  url: string;
  gen?: GenerationItem;
  dl?: DownloadItem;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const optimizedUrl = cloudinaryOptimize(url, 2400);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(1, z - 0.25));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock background page scroll while lightbox is open + capture wheel
  // (React synthetic wheel is passive — attach native non-passive listener
  // so preventDefault stops the page from scrolling behind the modal).
  const wheelTargetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = wheelTargetRef.current;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((z) => Math.max(1, Math.min(4, z + delta)));
    };
    node?.addEventListener("wheel", onNativeWheel, { passive: false });

    return () => {
      document.body.style.overflow = previousOverflow;
      node?.removeEventListener("wheel", onNativeWheel);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const onMouseUp = () => { isDragging.current = false; };

  const meta = gen ?? dl?.generation;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-gray-950/95 via-black/95 to-gray-900/95 backdrop-blur-xl"
      onClick={onClose}
    >
      {/* Top toolbar */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {meta && <TierChip tier={meta.qualityTier} dark />}
          {meta && (
            <span className="hidden text-xs font-medium text-white/70 sm:inline">
              {meta.contentType} · {meta.language}
            </span>
          )}
          {dl && (
            <span className="hidden rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white/80 sm:inline">
              {dl.format} · {dl.resolution}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ZoomButton onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1}>
            <MinusIcon className="h-4 w-4" />
          </ZoomButton>
          <span className="min-w-[3.5rem] text-center font-mono text-xs text-white/80">
            {Math.round(zoom * 100)}%
          </span>
          <ZoomButton onClick={() => setZoom((z) => Math.min(4, z + 0.25))} disabled={zoom >= 4}>
            <PlusIcon className="h-4 w-4" />
          </ZoomButton>
          <ZoomButton onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            <ResetIcon className="h-4 w-4" />
          </ZoomButton>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Download
          </button>
          <ZoomButton onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </ZoomButton>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={wheelTargetRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: zoom > 1 ? (isDragging.current ? "grabbing" : "grab") : "default" }}
      >
        <div
          className="relative max-h-full max-w-full transition-transform duration-150 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optimizedUrl ?? url}
            alt="Full size preview"
            draggable={false}
            className="max-h-[calc(100vh-9rem)] max-w-[calc(100vw-2rem)] select-none rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
          />
        </div>
      </div>

      {/* Footer hint */}
      <div
        className="shrink-0 border-t border-white/10 px-4 py-2.5 text-center text-[11px] text-white/50 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="hidden sm:inline">Scroll to zoom · Drag to pan · </span>
        <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[10px]">+</kbd>{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[10px]">−</kbd>{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[10px]">0</kbd>{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[10px]">Esc</kbd>
      </div>
    </div>
  );
}

function ShimmerGrid() {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
          <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          </div>
          <div className="space-y-2 p-3.5">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-3 w-32 rounded bg-gray-100" />
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function EmptyState({
  title, subtitle, icon,
}: { title: string; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-gray-200">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function TierChip({
  tier, compact, dark,
}: { tier: string; compact?: boolean; dark?: boolean }) {
  const styles: Record<string, string> = {
    BASIC: dark
      ? "bg-white/10 text-white/80 ring-white/15"
      : "bg-gray-100 text-gray-700 ring-gray-200",
    STANDARD: dark
      ? "bg-white/10 text-white/90 ring-white/20"
      : "bg-gray-900 text-white ring-gray-900",
    PREMIUM: dark
      ? "bg-amber-400/15 text-amber-200 ring-amber-300/30"
      : "bg-amber-50 text-amber-800 ring-amber-200",
  };
  const padding = compact ? "px-1.5 py-0" : "px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${padding} text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset backdrop-blur-md ${styles[tier] ?? styles.BASIC}`}>
      {tier === "PREMIUM" && <SparkleIcon className="h-2.5 w-2.5" />}
      {tier}
    </span>
  );
}

function ZoomButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5"
    >
      {children}
    </button>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ─── ICONS ──────────────────────────────────────────────────── */

function GalleryIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
    </svg>
  );
}
function ImageIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zM12 15.75h.008v.008H12v-.008z" />
    </svg>
  );
}
function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MinusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}
function ResetIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1015.66-6.33M21 4v5h-5" />
    </svg>
  );
}
