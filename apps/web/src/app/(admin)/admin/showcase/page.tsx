"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { adminApi, type ShowcaseRequestData } from "@/lib/admin-api";
import { COUNTRIES, COUNTRY_MAP, getCountryName, getCountryFlag } from "@ep/shared";
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
  CheckCircle2, XCircle, Clock, Eye, MoreVertical, Filter, Globe, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type FilterStatus = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

interface CategoryOption {
  id: string;
  name: string;
}

export default function ShowcasePage() {
  const [requests, setRequests] = useState<ShowcaseRequestData[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("PENDING");
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  // Review dialog
  const [reviewItem, setReviewItem] = useState<ShowcaseRequestData | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [rejectionReason, setRejectionReason] = useState("");
  const [categoryOverride, setCategoryOverride] = useState<string>("");
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Preview dialog
  const [previewItem, setPreviewItem] = useState<ShowcaseRequestData | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const statusParam = filterStatus === "ALL" ? undefined : filterStatus;
      const [result, countsData] = await Promise.all([
        adminApi.listShowcaseRequests({ page, limit: 25, status: statusParam }),
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
  }, [filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load categories when review dialog opens
  useEffect(() => {
    if (reviewItem) {
      adminApi.listCategories().then((cats: any[]) => {
        setCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
      }).catch(() => {});

      // Pre-populate target countries from request
      setTargetCountries(reviewItem.showcaseTargetCountries ?? []);
      setCategoryOverride(reviewItem.showcaseCategoryId ?? "");
      setRejectionReason("");
    }
  }, [reviewItem]);

  const openReview = (item: ShowcaseRequestData, decision: "APPROVED" | "REJECTED") => {
    setReviewItem(item);
    setReviewDecision(decision);
  };

  const handleReview = async () => {
    if (!reviewItem) return;
    setSubmitting(true);
    try {
      await adminApi.reviewShowcase(reviewItem.id, {
        decision: reviewDecision,
        rejectionReason: reviewDecision === "REJECTED" ? rejectionReason : undefined,
        categoryId: categoryOverride || undefined,
        targetCountries: targetCountries.length > 0 ? targetCountries : undefined,
      });
      toast.success(`Showcase request ${reviewDecision.toLowerCase()}`);
      setReviewItem(null);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Showcase Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review user-submitted generations for the public community showcase
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Request Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-16 text-center">
          <Filter className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 font-medium text-muted-foreground">No {filterStatus.toLowerCase()} requests</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filterStatus === "PENDING" ? "All caught up!" : "Try a different filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((item) => (
            <div
              key={item.id}
              className="group overflow-hidden rounded-xl border bg-card transition-all hover:shadow-md"
            >
              {/* Image */}
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

              {/* Info */}
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{item.userName}</p>
                    <p className="text-xs text-muted-foreground">{item.userEmail}</p>
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
                  <Badge variant="outline" className="text-[10px]">{item.categoryName}</Badge>
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
                  <p className="text-xs text-red-600">
                    Reason: {item.showcaseRejectionReason}
                  </p>
                )}

                {/* Actions */}
                {item.showcaseStatus === "PENDING" ? (
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
                  </div>
                ) : (
                  <div className="flex justify-end pt-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreviewItem(item)}>
                          <Eye className="mr-2 h-3.5 w-3.5" />View Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
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

      {/* Review Dialog */}
      <Dialog open={!!reviewItem} onOpenChange={() => setReviewItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === "APPROVED" ? "Approve" : "Reject"} Showcase Request
            </DialogTitle>
            <DialogDescription>
              Review and {reviewDecision === "APPROVED" ? "approve" : "reject"} this generation for the public showcase.
            </DialogDescription>
          </DialogHeader>

          {reviewItem && (
            <div className="space-y-4">
              {/* Preview image */}
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

              {/* Info */}
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">User:</span> {reviewItem.userName} ({reviewItem.userEmail})</p>
                <p><span className="text-muted-foreground">Language:</span> {reviewItem.language}</p>
                <p><span className="text-muted-foreground">Category:</span> {reviewItem.categoryName}</p>
                <p><span className="text-muted-foreground">Quality:</span> {reviewItem.qualityTier}</p>
                {reviewItem.userCountry && (
                  <p><span className="text-muted-foreground">Country:</span> {getCountryFlag(reviewItem.userCountry)} {getCountryName(reviewItem.userCountry)}</p>
                )}
              </div>

              {/* Category Override */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Category Override
                  <span className="ml-1 text-xs text-muted-foreground">(optional - change display category)</span>
                </label>
                <Select value={categoryOverride} onValueChange={setCategoryOverride}>
                  <SelectTrigger>
                    <SelectValue placeholder={reviewItem.categoryName || "Keep original"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Keep original ({reviewItem.categoryName})</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Countries */}
              {reviewDecision === "APPROVED" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Target Countries
                    <span className="ml-1 text-xs text-muted-foreground">(who will see this in their feed)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 rounded-lg border p-2 max-h-40 overflow-y-auto">
                    {COUNTRIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCountry(c.code)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs transition-all",
                          targetCountries.includes(c.code)
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-transparent hover:bg-muted"
                        )}
                      >
                        {c.flag} {c.code}
                      </button>
                    ))}
                  </div>
                  {targetCountries.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {targetCountries.length} countries selected: {targetCountries.map((c) => `${getCountryFlag(c)} ${getCountryName(c)}`).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Rejection Reason */}
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
            <Button variant="outline" onClick={() => setReviewItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={submitting || (reviewDecision === "REJECTED" && !rejectionReason.trim())}
              className={reviewDecision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              variant={reviewDecision === "REJECTED" ? "destructive" : "default"}
            >
              {submitting ? "Processing..." : reviewDecision === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
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
