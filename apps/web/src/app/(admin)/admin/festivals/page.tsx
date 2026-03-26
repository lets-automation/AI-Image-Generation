"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "@/lib/admin-api";
import toast from "react-hot-toast";
import {
  PageHeader, DataTable, FormDialog, FormField, ConfirmDialog,
  ContentTypeBadge, LoadingState, type ColumnDef,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { COUNTRIES, getCountryFlag, getCountryName } from "@ep/shared";
import { Plus, MoreHorizontal, Pencil, Power, Trash2, X, Flame, Globe } from "lucide-react";

type FestivalVisibility = "live" | "upcoming" | "past" | "disabled";

function getFestivalVisibility(f: FestivalData): FestivalVisibility {
  if (!f.isActive) return "disabled";
  const now = new Date();
  const festDate = new Date(f.date);
  const visStart = new Date(festDate);
  visStart.setDate(visStart.getDate() - f.visibilityDays);
  const visEnd = new Date(festDate);
  visEnd.setDate(visEnd.getDate() + 1);
  if (now >= visStart && now <= visEnd) return "live";
  if (now < visStart) return "upcoming";
  return "past";
}

const visibilityConfig: Record<FestivalVisibility, { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" },
  upcoming: { label: "Upcoming", className: "border-blue-500/25 bg-blue-500/10 text-blue-400" },
  past: { label: "Past", className: "border-muted bg-muted text-muted-foreground" },
  disabled: { label: "Disabled", className: "border-destructive/25 bg-destructive/10 text-destructive" },
};

function FestivalStatusBadge({ festival }: { festival: FestivalData }) {
  const vis = getFestivalVisibility(festival);
  const cfg = visibilityConfig[vis];
  return (
    <Badge variant="outline" className={cn("font-medium", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

interface PromotedCategoryLink {
  id: string;
  categoryId: string;
  sortOrder: number;
  promotionStartDays: number | null;
  promotionEndDays: number;
  category: { id: string; name: string; slug: string; contentType: string };
}

interface FestivalData {
  id: string;
  name: string;
  description: string | null;
  date: string;
  contentType: string;
  visibilityDays: number;
  isActive: boolean;
  metadata: { region?: string[]; religion?: string; tags?: string[] } | null;
  targetCountries?: string[] | null;
  promotedCategories?: PromotedCategoryLink[];
}

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  contentType: string;
}

export default function AdminFestivalsPage() {
  const [festivals, setFestivals] = useState<FestivalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [contentType, setContentType] = useState<"EVENT" | "POSTER">("EVENT");
  const [visibilityDays, setVisibilityDays] = useState(7);

  // Category promotion state
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);

  const loadFestivals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listFestivals();
      setFestivals(data as FestivalData[]);
    } catch {
      toast.error("Failed to load festivals");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async (ct: "EVENT" | "POSTER") => {
    try {
      setCategoriesLoading(true);
      const data = await adminApi.listCategories({ contentType: ct, limit: 50 });
      setAllCategories(data as CategoryOption[]);
    } catch (err) {
      console.error("Failed to load categories for festival form:", err);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => { loadFestivals(); }, [loadFestivals]);

  // Load categories when content type changes in form
  useEffect(() => {
    if (showForm) {
      loadCategories(contentType);
    }
  }, [showForm, contentType, loadCategories]);

  function resetForm() {
    setName(""); setDescription(""); setDate("");
    setContentType("EVENT"); setVisibilityDays(7);
    setSelectedCategoryIds([]);
    setTargetCountries([]);
    setEditId(null); setShowForm(false);
  }

  function startEdit(f: FestivalData) {
    setEditId(f.id);
    setName(f.name);
    setDescription(f.description || "");
    setDate(f.date.split("T")[0]);
    setContentType(f.contentType as "EVENT" | "POSTER");
    setVisibilityDays(f.visibilityDays);
    setSelectedCategoryIds(
      f.promotedCategories?.map((pc) => pc.categoryId) ?? []
    );
    setTargetCountries(f.targetCountries ?? []);
    setShowForm(true);
  }

  function toggleCategory(catId: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId)
        ? prev.filter((id) => id !== catId)
        : [...prev, catId]
    );
  }

  function toggleCountry(code: string) {
    setTargetCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  async function handleSubmit() {
    const body = {
      name,
      description: description || undefined,
      date,
      contentType,
      visibilityDays,
      categoryIds: selectedCategoryIds,
      targetCountries: targetCountries.length > 0 ? targetCountries : undefined,
    };
    try {
      if (editId) {
        await adminApi.updateFestival(editId, body);
        toast.success("Festival updated");
      } else {
        await adminApi.createFestival(body);
        toast.success("Festival created");
      }
      resetForm();
      loadFestivals();
    } catch {
      toast.error("Failed to save festival");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteFestival(deleteTarget);
      toast.success("Deleted");
      setDeleteTarget(null);
      loadFestivals();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleToggle(f: FestivalData) {
    try {
      await adminApi.updateFestival(f.id, { isActive: !f.isActive });
      loadFestivals();
    } catch {
      toast.error("Failed to update");
    }
  }

  const columns: ColumnDef<FestivalData>[] = [
    {
      key: "name",
      header: "Festival",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && (
            <p className="text-xs text-muted-foreground">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (row) => (
        <span className="text-sm">
          {new Date(row.date).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => <ContentTypeBadge type={row.contentType as "EVENT" | "POSTER"} />,
    },
    {
      key: "categories",
      header: "Promoted Categories",
      cell: (row) => {
        const cats = row.promotedCategories ?? [];
        if (cats.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {cats.slice(0, 3).map((pc) => (
              <Badge key={pc.categoryId} variant="secondary" className="text-xs">
                {pc.category.name}
              </Badge>
            ))}
            {cats.length > 3 && (
              <Badge variant="outline" className="text-xs">+{cats.length - 3}</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "countries",
      header: "Countries",
      cell: (row) => {
        const countries = row.targetCountries ?? [];
        if (countries.length === 0) return <span className="text-xs text-muted-foreground">Global</span>;
        return (
          <div className="flex flex-wrap gap-0.5">
            {countries.slice(0, 4).map((c: string) => (
              <span key={c} className="text-sm" title={getCountryName(c)}>{getCountryFlag(c)}</span>
            ))}
            {countries.length > 4 && (
              <Badge variant="outline" className="text-[10px]">+{countries.length - 4}</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "visibility",
      header: "Window",
      cell: (row) => {
        const festDate = new Date(row.date);
        const start = new Date(festDate);
        start.setDate(start.getDate() - row.visibilityDays);
        const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return (
          <span className="text-xs text-muted-foreground">
            {fmt(start)} &ndash; {fmt(festDate)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <FestivalStatusBadge festival={row} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => startEdit(row)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggle(row)}>
              <Power className="mr-2 h-4 w-4" /> {row.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteTarget(row.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filteredCategories = allCategories.filter(
    (c) => c.contentType === contentType
  );

  return (
    <div>
      <PageHeader
        title="Festival Calendar"
        description="Manage festivals, their visibility windows, and promoted categories"
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Festival
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable columns={columns} data={festivals} rowKey={(r) => r.id} emptyMessage="No festivals configured." />
      )}

      <FormDialog
        open={showForm}
        onOpenChange={(open) => { if (!open) resetForm(); }}
        title={editId ? "Edit Festival" : "New Festival"}
        description={editId
          ? "Update the festival details and promoted categories."
          : "Add a new festival. Select categories to promote — they'll appear at the top of user browsing during the visibility window."
        }
        onSubmit={handleSubmit}
        submitLabel={editId ? "Update Festival" : "Create Festival"}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" required description="The display name for this festival or occasion.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali, Christmas, Eid" required />
          </FormField>
          <FormField label="Date" required description="The actual date of the festival. Used to calculate visibility windows.">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Content Type" description="Determines which tab (Events/Posters) this festival applies to.">
            <Select value={contentType} onValueChange={(v) => setContentType(v as "EVENT" | "POSTER")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="POSTER">Poster</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Visibility (days)" description="Days before the festival when promotion starts. Categories will appear at top during this window.">
            <Input type="number" min={1} max={90} value={visibilityDays}
              onChange={(e) => setVisibilityDays(+e.target.value)} placeholder="e.g. 7" />
          </FormField>
          <FormField label="Description" description="Optional note about this festival.">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Festival of lights" />
          </FormField>
        </div>

        {/* Category Promotion Picker */}
        <FormField
          label="Promoted Categories"
          description={`Select categories to show at the top of the ${contentType === "EVENT" ? "Events" : "Posters"} page during this festival's visibility window.`}
        >
          <div className="space-y-3">
            {/* Selected categories */}
            {selectedCategoryIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCategoryIds.map((catId) => {
                  const cat = allCategories.find((c) => c.id === catId);
                  return (
                    <Badge
                      key={catId}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1 pl-2 pr-1 text-sm"
                    >
                      <Flame className="h-3 w-3 text-orange-500" />
                      {cat?.name ?? catId}
                      <button
                        type="button"
                        onClick={() => toggleCategory(catId)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Available categories grid */}
            <div className="max-h-40 overflow-y-auto rounded-lg border border-dashed border-gray-200 p-2">
              {categoriesLoading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading categories...</p>
              ) : filteredCategories.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No categories found for {contentType}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-xs transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 font-medium text-primary"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </FormField>

        {/* Target Countries Picker */}
        <FormField
          label="Target Countries"
          description="Select which countries this festival applies to. Leave empty to make it global (visible everywhere)."
        >
          <div className="space-y-3">
            {/* Selected countries */}
            {targetCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {targetCountries.map((code) => (
                  <Badge
                    key={code}
                    variant="secondary"
                    className="flex items-center gap-1 py-1 pl-2 pr-1 text-sm"
                  >
                    {getCountryFlag(code)} {getCountryName(code)}
                    <button
                      type="button"
                      onClick={() => toggleCountry(code)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={() => setTargetCountries([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Country grid */}
            <div className="max-h-40 overflow-y-auto rounded-lg border border-dashed border-gray-200 p-2">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {COUNTRIES.map((c) => {
                  const isSelected = targetCountries.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCountry(c.code)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-left text-xs transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 font-medium text-primary"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      {c.flag} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {targetCountries.length === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Global — this festival will be visible to users in all countries
              </p>
            )}
          </div>
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Festival"
        description="This action cannot be undone. The festival and its category links will be permanently removed."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
