"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { adminApi, type ShowcaseRequestData } from "@/lib/admin-api";
import { COUNTRIES, getCountryName, getCountryFlag } from "@ep/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2, XCircle, Clock, Eye, MoreVertical, Filter, Globe, RefreshCw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type FilterStatus = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
type FilterContentType = "ALL" | "EVENT" | "POSTER";

interface CategoryOption {
  id: string;
  name: string;
}

const KEEP_ORIGINAL_CATEGORY = "__keep_original__";

export default function ShowcasePage() {
  const [requests, setRequests] = useState<ShowcaseRequestData[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("PENDING");
  const [filterContentType, setFilterContentType] = useState<FilterContentType>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  // Review dialog
  const [reviewItem, setReviewItem] = useState<ShowcaseRequestData | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [rejectionReason, setRejectionReason] = useState("");
  const [categoryOverride, setCategoryOverride] = useState<string>(KEEP_ORIGINAL_CATEGORY);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Preview dialog
  const [previewItem, setPreviewItem] = useState<ShowcaseRequestData | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const statusParam = filterStatus === "ALL" ? undefined : filterStatus;
      const contentTypeParam = filterContentType === "ALL" ? undefined : filterContentType;
      const [result, countsData] = await Promise.all([
        adminApi.listShowcaseRequests({ page, limit: 25, status: statusParam, contentType: contentTypeParam }),
        adminApi.getShowcaseCounts(),
      ]);
      setRequests(result.data);
      setMeta(result.meta);
      setCounts(countsData);
    } catch (err) {
      console.error("Failed to fetch showcase requests:", err);
      toast.error("Failed to load showcase requests");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterContentType]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const visibleRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((item) => {
      const haystack = [
        item.userName,
        item.userEmail,
        item.categoryName,
        item.showcaseCategoryName ?? "",
        item.language,
        item.contentType,
        item.qualityTier,
        item.userCountry ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [requests, searchQuery]);

  // Load categories when review dialog opens
  useEffect(() => {
    if (!reviewItem) return;

    adminApi.listCategories().then((cats: any[]) => {
      setCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(() => {});

    setTargetCountries(reviewItem.showcaseTargetCountries ?? []);
    setCategoryOverride(reviewItem.showcaseCategoryId ?? KEEP_ORIGINAL_CATEGORY);
    setRejectionReason(reviewItem.showcaseRejectionReason ?? "");
  }, [reviewItem]);

  const openReview = (item: ShowcaseRequestData, decision: "APPROVED" | "REJECTED") => {
    setReviewItem(item);
    setReviewDecision(decision);
  };

  const closeReviewDialog = () => {
    setReviewItem(null);
    setRejectionReason("");
    setCategoryOverride(KEEP_ORIGINAL_CATEGORY);
    setTargetCountries([]);
  };

  const handleReview = async () => {
    if (!reviewItem) return;
    if (reviewDecision === "REJECTED" && !rejectionReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.reviewShowcase(reviewItem.id, {
        decision: reviewDecision,
        rejectionReason: reviewDecision === "REJECTED" ? rejectionReason.trim() : undefined,
        categoryId: categoryOverride === KEEP_ORIGINAL_CATEGORY ? undefined : categoryOverride,
        targetCountries: reviewDecision === "APPROVED"
          ? (targetCountries.length > 0 ? targetCountries : [])
          : undefined,
      });
      const isUpdate = reviewItem.showcaseStatus !== "PENDING";
      toast.success(isUpdate ? "Showcase entry updated" : `Showcase request ${reviewDecision.toLowerCase()}`);
      closeReviewDialog();
      fetchData(meta.page);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? "Failed to review request");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCountry = (code: string) => {
    setTargetCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
      case "REJECTED":
        return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const isUpdateReview = !!reviewItem && reviewItem.showcaseStatus !== "PENDING";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Showcase Moderation</h1>
          <p className="text-sm text-muted-foreground">
            Review submissions, update moderation decisions, and tune country/category visibility.
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchData(meta.page)} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          onClick={() => setFilterStatus("ALL")}
          className={cn(
            "rounded-lg border p-4 text-left transition-all hover:shadow-sm",
            filterStatus === "ALL" && "ring-2 ring-blue-400"
          )}
        >
          <p className="text-sm text-muted-foreground">All Requests</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{counts.total}</p>
        </button>
        <button
          onClick={() => setFilterStatus("PENDING")}
          className={cn(
            "rounded-lg border p-4 text-left transition-all hover:shadow-sm",
            filterStatus === "PENDING" && "ring-2 ring-amber-400"
          )}
        >
          <p className="text-sm text-muted-foreground">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{counts.pending}</p>
        </button>
        <button
          onClick={() => setFilterStatus("APPROVED")}
          className={cn(
            "rounded-lg border p-4 text-left transition-all hover:shadow-sm",
            filterStatus === "APPROVED" && "ring-2 ring-emerald-400"
          )}
        >
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{counts.approved}</p>
        </button>
        <button
          onClick={() => setFilterStatus("REJECTED")}
          className={cn(
            "rounded-lg border p-4 text-left transition-all hover:shadow-sm",
            filterStatus === "REJECTED" && "ring-2 ring-red-400"
          )}
        >
          <p className="text-sm text-muted-foreground">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{counts.rejected}</p>
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_190px] lg:grid-cols-[1fr_190px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by user, email, category, language, country..."
            className="pl-9"
          />
        </div>
        <Select value={filterContentType} onValueChange={(v) => setFilterContentType(v as FilterContentType)}>
          <SelectTrigger>
            <SelectValue placeholder="Content Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="EVENT">Event</SelectItem>
            <SelectItem value="POSTER">Poster</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden items-center justify-end text-xs text-muted-foreground lg:flex">
          Showing {visibleRequests.length} of {requests.length} on this page
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-16 text-center">
          <Filter className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 font-medium text-muted-foreground">No matching requests found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try changing status/content filters or search text.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRequests.map((item) => (
            <div
              key={item.id}
              className="group overflow-hidden rounded-xl border bg-card transition-all hover:shadow-md"
            >
              <div
                className="relative aspect-square w-full cursor-pointer overflow-hidden bg-muted"
                onClick={() => setPreviewItem(item)}
              >
                {item.resultImageUrl ? (
                  <Image
                    src={item.resultImageUrl}
                    alt="Showcase submission"
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  {statusBadge(item.showcaseStatus)}
                </div>
              </div>

              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.userName}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.userEmail}</p>
                  </div>
                  {item.userCountry && (
                    <span className="text-sm" title={getCountryName(item.userCountry)}>
                      {getCountryFlag(item.userCountry)} {item.userCountry}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{item.contentType}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{item.language}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{item.qualityTier}</Badge>
                  <Badge variant="outline" className="text-[10px]">{item.showcaseCategoryName ?? item.categoryName}</Badge>
                </div>

                {item.showcaseTargetCountries && item.showcaseTargetCountries.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="truncate">
                      {item.showcaseTargetCountries.map((c) => `${getCountryFlag(c)} ${c}`).join(", ")}
                    </span>
                  </div>
                )}

                {item.showcaseRejectionReason && (
                  <p className="line-clamp-2 text-xs text-red-600">
                    Reason: {item.showcaseRejectionReason}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => openReview(item, "APPROVED")}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => openReview(item, "REJECTED")}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="px-2">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPreviewItem(item)}>
                        <Eye className="mr-2 h-3.5 w-3.5" />View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openReview(item, item.showcaseStatus === "REJECTED" ? "REJECTED" : "APPROVED")}>
                        Edit Metadata
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page <= 1}
            onClick={() => fetchData(meta.page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.totalPages}
            onClick={() => fetchData(meta.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog open={!!reviewItem} onOpenChange={(open) => !open && closeReviewDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === "APPROVED" ? "Approve" : "Reject"} Showcase Request
            </DialogTitle>
            <DialogDescription>
              {isUpdateReview
                ? "Update this entry moderation details and visibility settings."
                : "Review this generation for the public showcase."}
            </DialogDescription>
          </DialogHeader>

          {reviewItem && (
            <div className="space-y-4">
              {reviewItem.resultImageUrl && (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={reviewItem.resultImageUrl}
                    alt="Preview"
                    fill
                    className="object-contain"
                    sizes="(max-width: 512px) 100vw, 512px"
                  />
                </div>
              )}

              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <p><span className="text-muted-foreground">Current Status:</span> {reviewItem.showcaseStatus}</p>
                <p><span className="text-muted-foreground">User:</span> {reviewItem.userName} ({reviewItem.userEmail})</p>
                <p><span className="text-muted-foreground">Language:</span> {reviewItem.language}</p>
                <p><span className="text-muted-foreground">Category:</span> {reviewItem.categoryName}</p>
                <p><span className="text-muted-foreground">Quality:</span> {reviewItem.qualityTier}</p>
                {reviewItem.userCountry && (
                  <p><span className="text-muted-foreground">Country:</span> {getCountryFlag(reviewItem.userCountry)} {getCountryName(reviewItem.userCountry)}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Decision</label>
                <Select value={reviewDecision} onValueChange={(v) => setReviewDecision(v as "APPROVED" | "REJECTED")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approve</SelectItem>
                    <SelectItem value="REJECTED">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Category Override
                  <span className="ml-1 text-xs text-muted-foreground">(optional display category)</span>
                </label>
                <Select value={categoryOverride} onValueChange={setCategoryOverride}>
                  <SelectTrigger>
                    <SelectValue placeholder={reviewItem.categoryName || "Keep original"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP_ORIGINAL_CATEGORY}>Keep original ({reviewItem.categoryName})</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {reviewDecision === "APPROVED" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Target Countries
                      <span className="ml-1 text-xs text-muted-foreground">(empty = global visibility)</span>
                    </label>
                    {targetCountries.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTargetCountries([])}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {COUNTRIES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => toggleCountry(c.code)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs transition-all",
                            targetCountries.includes(c.code)
                              ? "border-primary bg-primary/10 font-medium text-primary"
                              : "border-transparent hover:bg-muted"
                          )}
                        >
                          {c.flag} {c.code}
                        </button>
                      ))}
                    </div>
                  </div>
                  {targetCountries.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {targetCountries.length} selected: {targetCountries.map((c) => `${getCountryFlag(c)} ${getCountryName(c)}`).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {reviewDecision === "REJECTED" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rejection Reason</label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this submission is being rejected..."
                    rows={3}
                    maxLength={500}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeReviewDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={submitting || (reviewDecision === "REJECTED" && !rejectionReason.trim())}
              className={reviewDecision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              variant={reviewDecision === "REJECTED" ? "destructive" : "default"}
            >
              {submitting
                ? "Processing..."
                : isUpdateReview
                  ? "Save Changes"
                  : reviewDecision === "APPROVED"
                    ? "Approve"
                    : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Showcase Preview</DialogTitle>
          </DialogHeader>
          {previewItem?.resultImageUrl && (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
              <Image
                src={previewItem.resultImageUrl}
                alt="Full preview"
                fill
                className="object-contain"
                sizes="(max-width: 672px) 100vw, 672px"
              />
            </div>
          )}
          {previewItem && (
            <div className="flex flex-wrap gap-2">
              {statusBadge(previewItem.showcaseStatus)}
              <Badge variant="secondary">{previewItem.language}</Badge>
              <Badge variant="secondary">{previewItem.contentType}</Badge>
              <Badge variant="outline">{previewItem.showcaseCategoryName ?? previewItem.categoryName}</Badge>
              {previewItem.showcaseTargetCountries?.map((c) => (
                <Badge key={c} variant="secondary" className="text-xs">
                  {getCountryFlag(c)} {c}
                </Badge>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
