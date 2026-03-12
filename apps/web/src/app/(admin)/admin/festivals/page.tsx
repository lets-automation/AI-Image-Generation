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
import { Plus, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";

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

interface FestivalData {
  id: string;
  name: string;
  description: string | null;
  date: string;
  contentType: string;
  visibilityDays: number;
  isActive: boolean;
  metadata: { region?: string[]; religion?: string; tags?: string[] } | null;
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

  useEffect(() => { loadFestivals(); }, [loadFestivals]);

  function resetForm() {
    setName(""); setDescription(""); setDate("");
    setContentType("EVENT"); setVisibilityDays(7);
    setEditId(null); setShowForm(false);
  }

  function startEdit(f: FestivalData) {
    setEditId(f.id);
    setName(f.name);
    setDescription(f.description || "");
    setDate(f.date.split("T")[0]);
    setContentType(f.contentType as "EVENT" | "POSTER");
    setVisibilityDays(f.visibilityDays);
    setShowForm(true);
  }

  async function handleSubmit() {
    const body = { name, description: description || undefined, date, contentType, visibilityDays };
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

  return (
    <div>
      <PageHeader
        title="Festival Calendar"
        description="Manage festivals and their visibility windows"
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
          ? "Update the festival details. Templates associated with this festival will continue to use it."
          : "Add a new festival or occasion to the calendar. Templates in matching categories will become available to users within the visibility window around this date."
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
          <FormField label="Content Type" description="Determines which template categories this festival applies to.">
            <Select value={contentType} onValueChange={(v) => setContentType(v as "EVENT" | "POSTER")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="POSTER">Poster</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Visibility (days)" description="Number of days before the festival date when templates become visible to users. Example: 7 means templates appear 1 week before.">
            <Input type="number" min={1} max={90} value={visibilityDays}
              onChange={(e) => setVisibilityDays(+e.target.value)} placeholder="e.g. 7" />
          </FormField>
          <FormField label="Description" description="Optional note about this festival.">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Festival of lights" />
          </FormField>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Festival"
        description="This action cannot be undone. The festival will be permanently removed."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
