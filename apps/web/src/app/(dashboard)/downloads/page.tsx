"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { useRequireAuth } from "@/hooks/useAuth";

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

export default function DownloadsPage() {
  const { isReady } = useRequireAuth();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [generations, setGenerations] = useState<Array<{
    id: string;
    status: string;
    qualityTier: string;
    language: string;
    contentType: string;
    creditCost: number;
    resultImageUrl: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"generations" | "downloads">("generations");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

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
        // Refresh downloads list
        if (tab === "downloads") fetchDownloads();
      }
    } catch {
      // Ignore
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      COMPLETED: "bg-green-100 text-green-700",
      FAILED: "bg-red-100 text-red-700",
      PROCESSING: "bg-blue-100 text-blue-700",
      QUEUED: "bg-yellow-100 text-yellow-700",
      CANCELLED: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
    );
  };

  const tierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      BASIC: "bg-gray-100 text-gray-700",
      STANDARD: "bg-blue-100 text-blue-700",
      PREMIUM: "bg-purple-100 text-purple-700",
    };
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[tier] ?? "bg-gray-100 text-gray-600"}`}>
        {tier}
      </span>
    );
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">My Creatives</h1>
      <p className="mb-6 text-sm text-gray-500">View your generated images and download history.</p>

      {/* Tabs */}
      <div className="mb-8 inline-flex rounded-xl bg-gray-100/80 p-1 ring-1 ring-gray-200/50">
        <button
          onClick={() => { setTab("generations"); setPage(1); }}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-all ${
            tab === "generations" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:bg-gray-200/50 hover:text-gray-900"
          }`}
        >
          All Generations
        </button>
        <button
          onClick={() => { setTab("downloads"); setPage(1); }}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-all ${
            tab === "downloads" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:bg-gray-200/50 hover:text-gray-900"
          }`}
        >
          Downloads
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-gray-200 aspect-square" />
          ))}
        </div>
      ) : tab === "generations" ? (
        /* Generations Grid */
        generations.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="mt-4 text-gray-500">No generations yet. Go create your first creative!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {generations.map((gen) => (
              <div key={gen.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-gray-300 hover:shadow-xl">
                <div className="relative aspect-square bg-gray-100">
                  {gen.resultImageUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={gen.resultImageUrl}
                        alt="Generated creative"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                        <button
                          onClick={() => setFullscreenImage(gen.resultImageUrl)}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-lg"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(gen.id)}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-lg"
                        >
                          Download
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {gen.status === "PROCESSING" || gen.status === "QUEUED" ? (
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
                      ) : (
                        <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    {statusBadge(gen.status)}
                    {tierBadge(gen.qualityTier)}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(gen.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {gen.errorMessage && (
                    <p className="mt-1 truncate text-xs text-red-500">{gen.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Downloads List */
        downloads.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-gray-500">No downloads yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Preview</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Details</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Format</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {downloads.map((dl) => (
                  <tr key={dl.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="h-12 w-12 overflow-hidden rounded bg-gray-100">
                        {dl.generation?.resultImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={dl.generation.resultImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-300">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{dl.generation?.prompt?.slice(0, 60) ?? "—"}...</p>
                      <div className="mt-1 flex gap-2">
                        {dl.generation && tierBadge(dl.generation.qualityTier)}
                        <span className="text-xs text-gray-400">{dl.generation?.language}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {dl.format.toUpperCase()} &middot; {dl.resolution}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(dl.downloadedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {dl.generation?.resultImageUrl && (
                        <button
                          onClick={() => handleDownload(dl.generationId)}
                          className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                        >
                          Re-download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

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
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullscreenImage}
              alt="Full size preview"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              <a
                href={fullscreenImage}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-lg transition-colors hover:bg-gray-100"
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
