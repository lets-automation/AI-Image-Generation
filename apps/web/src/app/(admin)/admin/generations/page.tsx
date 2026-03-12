"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { adminApi, type GenerationHistoryItem, type GenerationStats } from "@/lib/admin-api";

// ─── Helpers ────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatProcessingTime(ms: number | null): string {
  if (ms == null) return "--";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cents: number | null): string {
  if (cents == null) return "--";
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETED: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  FAILED:    { bg: "bg-red-50 dark:bg-red-500/10",         text: "text-red-700 dark:text-red-400",         dot: "bg-red-500" },
  PROCESSING:{ bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-400",     dot: "bg-amber-500" },
  QUEUED:    { bg: "bg-gray-50 dark:bg-gray-500/10",       text: "text-gray-700 dark:text-gray-400",       dot: "bg-gray-400" },
};

const TIER_STYLES: Record<string, string> = {
  BASIC:    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  STANDARD: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  PREMIUM:  "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
};

// ─── Page ───────────────────────────────────────────────

export default function GenerationsPage() {
  // Stats
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [providerFilter, setProviderFilter] = useState("");
  const [emailSearch, setEmailSearch] = useState("");

  // Data
  const [generations, setGenerations] = useState<GenerationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const LIMIT = 25;

  // Detail panel
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Fetch stats ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const data = await adminApi.getGenerationStats();
        if (!cancelled) setStats(data);
      } catch (err) {
        console.error("Failed to load generation stats:", err);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Fetch generations ────────────────────────────────
  const fetchGenerations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (tierFilter !== "ALL") params.set("tier", tierFilter);
      if (providerFilter.trim()) params.set("provider", providerFilter.trim());
      if (emailSearch.trim()) params.set("email", emailSearch.trim());

      const result = await adminApi.listGenerations(params.toString());
      setGenerations(result.data);
      setMeta({ total: result.meta.total, totalPages: result.meta.totalPages });
    } catch (err) {
      console.error("Failed to load generations:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, tierFilter, providerFilter, emailSearch]);

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  // Reset page when filters change
  const updateFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  // Toggle row expansion
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ─── Pagination helpers ───────────────────────────────
  const pageNumbers = (): number[] => {
    const pages: number[] = [];
    const total = meta.totalPages;
    const current = page;
    const delta = 2;
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      pages.push(i);
    }
    if (pages[0] > 1) {
      if (pages[0] > 2) pages.unshift(-1); // ellipsis
      pages.unshift(1);
    }
    if (pages[pages.length - 1] < total) {
      if (pages[pages.length - 1] < total - 1) pages.push(-1);
      pages.push(total);
    }
    return pages;
  };

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Generation History
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Browse all image generations, view statuses, costs, and details
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-6 w-12 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))
        ) : (
          <>
            <StatBox label="Total" value={stats?.total.toLocaleString() ?? "0"} />
            <StatBox label="Completed" value={stats?.completed.toLocaleString() ?? "0"} color="text-emerald-600 dark:text-emerald-400" />
            <StatBox label="Failed" value={stats?.failed.toLocaleString() ?? "0"} color="text-red-600 dark:text-red-400" />
            <StatBox label="Success Rate" value={stats ? `${stats.successRate}%` : "0%"} />
            <StatBox label="Avg Processing" value={stats ? formatProcessingTime(stats.avgProcessingMs) : "--"} />
            <StatBox label="Last 24h" value={stats?.last24h.toLocaleString() ?? "0"} />
          </>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => updateFilter(setStatusFilter, e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="ALL">All Statuses</option>
          <option value="QUEUED">Queued</option>
          <option value="PROCESSING">Processing</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>

        {/* Tier */}
        <select
          value={tierFilter}
          onChange={(e) => updateFilter(setTierFilter, e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="ALL">All Tiers</option>
          <option value="BASIC">Basic</option>
          <option value="STANDARD">Standard</option>
          <option value="PREMIUM">Premium</option>
        </select>

        {/* Provider */}
        <input
          type="text"
          value={providerFilter}
          onChange={(e) => updateFilter(setProviderFilter, e.target.value)}
          placeholder="Provider..."
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 sm:w-40"
        />

        {/* Email search */}
        <input
          type="text"
          value={emailSearch}
          onChange={(e) => updateFilter(setEmailSearch, e.target.value)}
          placeholder="Search by email..."
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 sm:w-56"
        />

        {/* Clear filters */}
        {(statusFilter !== "ALL" || tierFilter !== "ALL" || providerFilter || emailSearch) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL");
              setTierFilter("ALL");
              setProviderFilter("");
              setEmailSearch("");
              setPage(1);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">User</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Template</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tier</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Provider</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Model ID</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Language</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Orientation</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Time</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">AI Cost</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Credits</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <div className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading generations...
                  </div>
                </td>
              </tr>
            ) : generations.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-gray-500 dark:text-gray-400">
                  No generations found
                </td>
              </tr>
            ) : (
              generations.map((gen) => {
                const statusStyle = STATUS_STYLES[gen.status] ?? STATUS_STYLES.QUEUED;
                const tierStyle = TIER_STYLES[gen.qualityTier] ?? TIER_STYLES.BASIC;
                const isExpanded = expandedId === gen.id;

                return (
                  <Fragment key={gen.id}>
                    <tr
                      onClick={() => toggleExpand(gen.id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      {/* Status */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                          {gen.status}
                        </span>
                      </td>

                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{gen.user.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{gen.user.email}</div>
                      </td>

                      {/* Template */}
                      <td className="max-w-[160px] truncate px-4 py-3 text-gray-700 dark:text-gray-300">
                        {gen.template?.name ?? "Custom image"}
                      </td>

                      {/* Tier */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tierStyle}`}>
                          {gen.qualityTier}
                        </span>
                      </td>

                      {/* Provider */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {gen.providerUsed ?? "--"}
                      </td>

                      {/* Model ID */}
                      <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {gen.modelId ?? "--"}
                      </td>

                      {/* Language */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {gen.language}
                      </td>

                      {/* Orientation */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {gen.orientation ?? "--"}
                      </td>

                      {/* Processing Time */}
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatProcessingTime(gen.processingMs)}
                      </td>

                      {/* AI Cost */}
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCost(gen.aiCostCents)}
                      </td>

                      {/* Credits */}
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {gen.creditCost}
                      </td>

                      {/* Created */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                        {relativeTime(gen.createdAt)}
                      </td>
                    </tr>

                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-800/80">
                        <td colSpan={12} className="px-6 py-4">
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {/* Left: metadata */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Details
                              </h4>
                              <DetailRow label="Generation ID" value={gen.id} mono />
                              {gen.batchId && <DetailRow label="Batch ID" value={gen.batchId} mono />}
                              <DetailRow label="Content Type" value={gen.contentType} />
                              {gen.effectiveTier && gen.effectiveTier !== gen.qualityTier && (
                                <DetailRow label="Effective Tier" value={gen.effectiveTier} />
                              )}
                              <DetailRow label="Created" value={new Date(gen.createdAt).toLocaleString()} />
                            </div>

                            {/* Center: error or status info */}
                            <div className="space-y-3">
                              {gen.errorMessage && (
                                <>
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                                    Error
                                  </h4>
                                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                                    {gen.errorMessage}
                                  </div>
                                </>
                              )}
                              {gen.providerUsed && (
                                <>
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Provider Info
                                  </h4>
                                  <DetailRow label="Provider" value={gen.providerUsed} />
                                  <DetailRow label="Model" value={gen.modelId ?? "--"} />
                                  <DetailRow label="AI Cost" value={formatCost(gen.aiCostCents)} />
                                  <DetailRow label="Processing" value={formatProcessingTime(gen.processingMs)} />
                                </>
                              )}
                            </div>

                            {/* Right: result image */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Result
                              </h4>
                              {gen.resultImageUrl ? (
                                <a
                                  href={gen.resultImageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                  <img
                                    src={gen.resultImageUrl}
                                    alt="Generation result"
                                    className="h-40 w-full object-cover transition-transform hover:scale-105"
                                  />
                                </a>
                              ) : (
                                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-600 dark:text-gray-500">
                                  No image available
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {(page - 1) * LIMIT + 1}--{Math.min(page * LIMIT, meta.total)} of{" "}
            {meta.total.toLocaleString()} results
          </p>
          <nav className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Prev
            </button>
            {pageNumbers().map((p, i) =>
              p === -1 ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-gray-900 dark:text-gray-100"}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`text-right text-sm text-gray-800 dark:text-gray-200 ${
          mono ? "font-mono text-xs break-all" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
