"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { adminApi, type CategoryData } from "@/lib/admin-api";
import { Textarea } from "@/components/ui/textarea";
import toast from "react-hot-toast";
import {
  PageHeader, FormDialog, FormField, ConfirmDialog,
  StatusBadge, LoadingState, EmptyState,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, MoreHorizontal, Pencil, Power, Trash2,
  Upload, Image as ImageIcon, Save, X, FileText,
} from "lucide-react";
import type { FieldSchemaData } from "@/lib/admin-api";

interface TemplateData {
  id: string;
  name: string;
  contentType: string;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  imageUrl: string;
  width: number;
  height: number;
  safeZones: SafeZone[];
  layoutVersion: number;
  isActive: boolean;
  usageCount: number;
  metadata: { description?: string } | null;
}

interface SafeZone {
  id: string;
  type: "text" | "logo" | "both";
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  maxFontSize?: number;
  position: string;
}

const POSITIONS = [
  "TOP_LEFT", "TOP_CENTER", "TOP_RIGHT",
  "MIDDLE_LEFT", "MIDDLE_CENTER", "MIDDLE_RIGHT",
  "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT",
];

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editingZones, setEditingZones] = useState<string | null>(null);
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [uploadContentType, setUploadContentType] = useState<"EVENT" | "POSTER">("EVENT");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDimensions, setUploadDimensions] = useState<{ w: number; h: number } | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPrompt, setUploadPrompt] = useState("");

  // Edit details dialog state
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editDetailsId, setEditDetailsId] = useState<string | null>(null);
  const [editDetailsName, setEditDetailsName] = useState("");
  const [editDetailsCategoryId, setEditDetailsCategoryId] = useState("");
  const [editDetailsPrompt, setEditDetailsPrompt] = useState("");
  const [editDetailsIsActive, setEditDetailsIsActive] = useState(true);
  const [editDetailsContentType, setEditDetailsContentType] = useState<"EVENT" | "POSTER">("EVENT");
  const [editDetailsSafeZoneCount, setEditDetailsSafeZoneCount] = useState(0);
  const [savingDetails, setSavingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Edit image replacement state
  const [editDetailsImageUrl, setEditDetailsImageUrl] = useState<string | null>(null);
  const [editDetailsNewImage, setEditDetailsNewImage] = useState<File | null>(null);
  const [editDetailsNewImagePreview, setEditDetailsNewImagePreview] = useState<string | null>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tmpl, cats] = await Promise.all([
        adminApi.listTemplates({ search: searchQuery }),
        adminApi.listCategories(),
      ]);
      setTemplates(tmpl as TemplateData[]);
      setCategories(cats);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  function handleFileSelect(file: File | undefined) {
    setUploadFile(null);
    setUploadDimensions(null);
    setUploadWarning(null);
    setUploadError(null);
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size must be under 10 MB.");
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      setUploadDimensions({ w, h });

      if (w < 1024 || h < 1024) {
        setUploadWarning(`Image is ${w}x${h}px. For best results, use 1024x1024px or larger.`);
      } else if (w > 4096 || h > 4096) {
        setUploadWarning(`Image is ${w}x${h}px. It will be auto-resized to fit within 4096x4096px.`);
      }

      setUploadFile(file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setUploadError("Unable to read image. The file may be corrupt.");
    };
    img.src = url;
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", uploadFile);
      formData.append("name", uploadName);
      formData.append("contentType", uploadContentType);
      formData.append("categoryId", uploadCategoryId);
      formData.append("safeZones", "[]");
      if (uploadPrompt.trim()) {
        formData.append("metadata", JSON.stringify({ description: uploadPrompt.trim() }));
      }
      await adminApi.createTemplate(formData);
      toast.success("Template uploaded");
      setShowUpload(false);
      setUploadName(""); setUploadFile(null); setUploadDimensions(null); setUploadWarning(null); setUploadError(null); setUploadPrompt("");
      loadData();
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(axErr?.response?.data?.error?.message ?? "Upload failed — check image dimensions and format");
    } finally {
      setUploading(false);
    }
  }

  function startZoneEditor(template: TemplateData) {
    setEditingZones(template.id);
    setSafeZones([...template.safeZones]);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; drawCanvas(); };
    img.src = template.imageUrl;
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = 550 / img.width;
    canvas.width = 550;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    safeZones.forEach((zone) => {
      const x = (zone.x / 100) * canvas.width;
      const y = (zone.y / 100) * canvas.height;
      const w = (zone.width / 100) * canvas.width;
      const h = (zone.height / 100) * canvas.height;
      ctx.strokeStyle = zone.id === selectedZoneId ? "#3b82f6" : "#22c55e";
      ctx.lineWidth = 2;
      ctx.setLineDash(zone.id === selectedZoneId ? [] : [5, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = zone.id === selectedZoneId ? "#3b82f6" : "#22c55e";
      ctx.font = "11px monospace";
      ctx.fillText(`${zone.type} - ${zone.position}`, x + 4, y + 14);
    });

    if (isDrawing && drawStart && drawCurrent) {
      const rx = Math.min(drawStart.x, drawCurrent.x);
      const ry = Math.min(drawStart.y, drawCurrent.y);
      const rw = Math.abs(drawCurrent.x - drawStart.x);
      const rh = Math.abs(drawCurrent.y - drawStart.y);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "11px monospace";
      const pctW = Math.round((rw / canvas.width) * 100);
      const pctH = Math.round((rh / canvas.height) * 100);
      ctx.fillText(`${pctW}% x ${pctH}%`, rx + 4, ry + rh - 6);
    }
  }

  useEffect(() => { if (editingZones) drawCanvas(); });

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickedZone = safeZones.find((zone) => {
      const zx = (zone.x / 100) * canvas.width;
      const zy = (zone.y / 100) * canvas.height;
      const zw = (zone.width / 100) * canvas.width;
      const zh = (zone.height / 100) * canvas.height;
      return x >= zx && x <= zx + zw && y >= zy && y <= zy + zh;
    });
    if (clickedZone) { setSelectedZoneId(clickedZone.id); return; }
    setIsDrawing(true); setDrawStart({ x, y }); setSelectedZoneId(null);
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDrawCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) { setIsDrawing(false); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const x = Math.min(drawStart.x, endX);
    const y = Math.min(drawStart.y, endY);
    const w = Math.abs(endX - drawStart.x);
    const h = Math.abs(endY - drawStart.y);
    if (w > 20 && h > 20) {
      const newZone: SafeZone = {
        id: `zone-${Date.now()}`, type: "text",
        x: (x / canvas.width) * 100, y: (y / canvas.height) * 100,
        width: (w / canvas.width) * 100, height: (h / canvas.height) * 100,
        padding: 8, position: "TOP_LEFT",
      };
      setSafeZones((prev) => [...prev, newZone]);
      setSelectedZoneId(newZone.id);
    }
    setIsDrawing(false); setDrawStart(null); setDrawCurrent(null);
  }

  function updateZoneProperty(id: string, key: string, value: unknown) {
    setSafeZones((prev) => prev.map((z) => (z.id === id ? { ...z, [key]: value } : z)));
  }

  function deleteZone(id: string) {
    setSafeZones((prev) => prev.filter((z) => z.id !== id));
    if (selectedZoneId === id) setSelectedZoneId(null);
  }

  async function saveSafeZones() {
    if (!editingZones) return;
    try {
      await adminApi.updateSafeZones(editingZones, safeZones);
      toast.success("Safe zones saved");
      setEditingZones(null);
      loadData();
    } catch {
      toast.error("Failed to save safe zones");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteTemplate(deleteTarget);
      toast.success("Template deleted");
      setDeleteTarget(null);
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleToggleActive(t: TemplateData) {
    try {
      await adminApi.updateTemplate(t.id, { isActive: !t.isActive });
      toast.success(t.isActive ? "Deactivated" : "Activated");
      loadData();
    } catch {
      toast.error("Failed to update");
    }
  }

  function startEditDetails(t: TemplateData) {
    setEditDetailsId(t.id);
    setEditDetailsName(t.name);
    setEditDetailsCategoryId(t.categoryId);
    setEditDetailsPrompt((t.metadata as { description?: string } | null)?.description ?? "");
    setEditDetailsIsActive(t.isActive);
    setEditDetailsContentType(t.contentType as "EVENT" | "POSTER");
    setEditDetailsSafeZoneCount(t.safeZones?.length ?? 0);
    setEditDetailsImageUrl(t.imageUrl);
    setEditDetailsNewImage(null);
    setEditDetailsNewImagePreview(null);
    setShowEditDetails(true);
  }

  function handleEditImageSelect(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB.");
      return;
    }
    if (editDetailsNewImagePreview) {
      URL.revokeObjectURL(editDetailsNewImagePreview);
    }
    const preview = URL.createObjectURL(file);
    setEditDetailsNewImage(file);
    setEditDetailsNewImagePreview(preview);
  }

  async function handleSaveDetails() {
    if (!editDetailsId) return;
    setSavingDetails(true);
    try {
      // Upload replacement image if selected
      if (editDetailsNewImage) {
        const formData = new FormData();
        formData.append("image", editDetailsNewImage);
        await adminApi.replaceTemplateImage(editDetailsId, formData);
      }
      await adminApi.updateTemplate(editDetailsId, {
        name: editDetailsName,
        categoryId: editDetailsCategoryId,
        isActive: editDetailsIsActive,
        contentType: editDetailsContentType,
        metadata: { description: editDetailsPrompt.trim() || undefined },
      });
      toast.success("Template details updated");
      if (editDetailsNewImagePreview) {
        URL.revokeObjectURL(editDetailsNewImagePreview);
      }
      setShowEditDetails(false);
      setEditDetailsId(null);
      setEditDetailsNewImage(null);
      setEditDetailsNewImagePreview(null);
      loadData();
    } catch {
      toast.error("Failed to update template");
    } finally {
      setSavingDetails(false);
    }
  }

  const selectedZone = safeZones.find((z) => z.id === selectedZoneId);
  const editTemplate = templates.find((t) => t.id === editingZones);

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Upload and manage template images with safe zones"
        actions={
          <div className="flex items-center gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                type="search" 
                placeholder="Search templates..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="mr-2 h-4 w-4" /> Upload Template
            </Button>
          </div>
        }
      />

      {/* Template Grid */}
      {loading ? (
        <LoadingState />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-10 w-10" />}
          title="No templates yet"
          description="Upload your first template to get started."
          action={<Button onClick={() => setShowUpload(true)}><Upload className="mr-2 h-4 w-4" /> Upload</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <Card key={t.id} className={!t.isActive ? "opacity-60" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.imageUrl} alt={t.name} className="h-48 w-full rounded-t-lg object-cover" />
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category.name} · {t.width}×{t.height}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {t.safeZones.length} zones
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        v{t.layoutVersion}
                      </Badge>
                      {(t.metadata as { description?: string } | null)?.description && (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          AI Prompt ✓
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">{t.usageCount} uses</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEditDetails(t)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => startZoneEditor(t)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Zones
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(t)}>
                        <Power className="mr-2 h-4 w-4" /> {t.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(t.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <FormDialog
        open={showUpload}
        onOpenChange={(open) => { if (!open) setShowUpload(false); }}
        title="Upload Template"
        description="Upload a template image and assign it to a category. After uploading, you can draw safe zones on the image to define where user content (text, logos) should be placed."
        onSubmit={handleUpload}
        submitLabel={uploading ? "Uploading..." : "Upload"}
        loading={uploading}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Template Name" required description="A descriptive name shown to users when selecting templates.">
            <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Diwali Business Card" required />
          </FormField>
          <FormField label="Content Type" description="Event templates support date-based content. Poster templates are standalone designs.">
            <Select value={uploadContentType} onValueChange={(v) => setUploadContentType(v as "EVENT" | "POSTER")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="POSTER">Poster</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category" required description="Only categories matching the selected content type are shown.">
            <Select value={uploadCategoryId} onValueChange={setUploadCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => c.contentType === uploadContentType)
                  .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Image File" required description="Accepted formats: JPEG, PNG, WebP. Recommended 1024x1024px+.">
            <Input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileSelect(e.target.files?.[0])} required />
            {uploadDimensions && !uploadError && (
              <p className="mt-1 text-xs text-muted-foreground">
                Dimensions: {uploadDimensions.w} x {uploadDimensions.h}px
              </p>
            )}
            {uploadError && (
              <p className="mt-1 text-xs font-medium text-destructive">{uploadError}</p>
            )}
            {uploadWarning && (
              <p className="mt-1 text-xs text-yellow-600">{uploadWarning}</p>
            )}
          </FormField>
        </div>
        <FormField label="AI Prompt (for model)" description="Describe the template as it already exists. This is context for style/layout, not a command to add new elements.">
          <Textarea
            value={uploadPrompt}
            onChange={(e) => setUploadPrompt(e.target.value)}
            placeholder="e.g. This template features a warm golden Diwali theme with diya and rangoli accents. The layout keeps headline space at top-center and contact details near the bottom."
            rows={4}
            maxLength={2000}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{uploadPrompt.length}/2000</p>
        </FormField>
        <CategoryFieldsPreview
          categories={categories}
          categoryId={uploadCategoryId}
          contentType={uploadContentType}
        />
      </FormDialog>

      {/* Safe Zone Editor Dialog */}
      <Dialog open={!!editingZones} onOpenChange={(open) => { if (!open) setEditingZones(null); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Safe Zone Editor: {editTemplate?.name}</DialogTitle>
          </DialogHeader>

          {/* Instructions banner */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
            <p className="font-medium text-blue-800 dark:text-blue-200">How Safe Zones Work</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
              <li><strong>Draw</strong> a rectangle on the image to create a new safe zone</li>
              <li><strong>Click</strong> an existing zone to select and edit its properties</li>
              <li>Safe zones define where user content (text, logos) will be placed during generation</li>
              <li>Each zone has a <strong>position</strong> (e.g. Top Left) that maps to the user&apos;s field placement grid</li>
              <li><strong>Padding</strong> adds inner spacing (px). <strong>Max Font Size</strong> caps text scaling (leave blank for auto)</li>
            </ul>
          </div>

          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDrawStart(null); setDrawCurrent(null); } }}
                className="cursor-crosshair rounded-md border"
                style={{ maxWidth: "550px", maxHeight: "500px", objectFit: "contain" }}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {safeZones.length} safe zone{safeZones.length !== 1 ? "s" : ""} defined
                {safeZones.length === 0 && " — draw on the image above to add zones"}
              </p>
            </div>

            <div className="flex-1 space-y-3">
              <p className="text-sm font-medium">
                {selectedZone ? "Zone Properties" : safeZones.length > 0 ? "Click a zone to edit" : "Draw your first zone"}
              </p>

              {selectedZone && (
                <div className="space-y-3 rounded-md border p-4">
                  <FormField label="Type" description="Text: for user text fields. Logo: for images. Both: accepts either.">
                    <Select value={selectedZone.type} onValueChange={(v) => updateZoneProperty(selectedZone.id, "type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="logo">Logo</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Position" description="Maps to the 3x3 position grid users see when placing their content.">
                    <Select value={selectedZone.position} onValueChange={(v) => updateZoneProperty(selectedZone.id, "position", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Padding (px)" description="Inner spacing from zone edges">
                      <Input type="number" min={0} max={50} value={selectedZone.padding}
                        onChange={(e) => updateZoneProperty(selectedZone.id, "padding", +e.target.value)} />
                    </FormField>
                    <FormField label="Max Font Size" description="Leave blank for auto-fit">
                      <Input type="number" min={8} max={200}
                        value={selectedZone.maxFontSize ?? ""}
                        onChange={(e) => updateZoneProperty(selectedZone.id, "maxFontSize", e.target.value ? +e.target.value : undefined)}
                        placeholder="Auto" />
                    </FormField>
                  </div>
                  <div className="rounded bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                    Zone area: {Math.round(selectedZone.x)}%, {Math.round(selectedZone.y)}% — {Math.round(selectedZone.width)}% x {Math.round(selectedZone.height)}%
                  </div>
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteZone(selectedZone.id)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Zone
                  </Button>
                </div>
              )}

              {safeZones.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">All Zones</p>
                  {safeZones.map((zone) => (
                    <button
                      key={zone.id}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${zone.id === selectedZoneId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                      {zone.type} — {zone.position.replace(/_/g, " ")} — {Math.round(zone.width)}% x {Math.round(zone.height)}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingZones(null)}>Cancel</Button>
            <Button onClick={saveSafeZones}>
              <Save className="mr-2 h-4 w-4" /> Save Zones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <FormDialog
        open={showEditDetails}
        onOpenChange={(open) => { if (!open) { setShowEditDetails(false); setEditDetailsId(null); if (editDetailsNewImagePreview) URL.revokeObjectURL(editDetailsNewImagePreview); setEditDetailsNewImage(null); setEditDetailsNewImagePreview(null); } }}
        title="Edit Template Details"
        description="Update template settings, category, and AI prompt."
        onSubmit={handleSaveDetails}
        submitLabel={savingDetails ? "Saving..." : "Save Changes"}
        loading={savingDetails}
      >
        {/* Template Image Preview & Replace */}
        <FormField label="Template Image">
          <div className="flex items-start gap-4">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={editDetailsNewImagePreview || editDetailsImageUrl || ""}
                alt="Template"
                className="h-full w-full object-cover"
              />
              {editDetailsNewImage && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                  New image
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editImageInputRef.current?.click()}
              >
                <ImageIcon className="mr-2 h-3.5 w-3.5" />
                Replace Image
              </Button>
              {editDetailsNewImage && (
                <button
                  type="button"
                  onClick={() => {
                    if (editDetailsNewImagePreview) URL.revokeObjectURL(editDetailsNewImagePreview);
                    setEditDetailsNewImage(null);
                    setEditDetailsNewImagePreview(null);
                    if (editImageInputRef.current) editImageInputRef.current.value = "";
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="mr-1 inline h-3 w-3" />
                  Undo change
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">JPG, PNG, WebP · Max 10 MB</p>
            </div>
          </div>
          <input
            ref={editImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleEditImageSelect(e.target.files?.[0])}
            className="hidden"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Template Name" required>
            <Input value={editDetailsName} onChange={(e) => setEditDetailsName(e.target.value)} required />
          </FormField>
          <FormField label="Content Type">
            <Select value={editDetailsContentType} onValueChange={(v) => setEditDetailsContentType(v as "EVENT" | "POSTER")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="POSTER">Poster</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category">
            <Select value={editDetailsCategoryId} onValueChange={setEditDetailsCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => c.contentType === editDetailsContentType)
                  .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Status">
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditDetailsIsActive(!editDetailsIsActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editDetailsIsActive ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editDetailsIsActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm">{editDetailsIsActive ? "Active" : "Inactive"}</span>
            </div>
          </FormField>
        </div>
        {editDetailsSafeZoneCount > 0 && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            🎯 This template has <span className="font-semibold text-foreground">{editDetailsSafeZoneCount} safe zone{editDetailsSafeZoneCount > 1 ? "s" : ""}</span> configured. Use "Edit Zones" from the template card menu to modify them.
          </div>
        )}
        <FormField label="AI Prompt (for model)" description="Describe the existing template style/layout. Avoid command words like Create/Add/Place.">
          <Textarea
            value={editDetailsPrompt}
            onChange={(e) => setEditDetailsPrompt(e.target.value)}
            placeholder="e.g. This template has a festive golden style with decorative accents and a clear top headline area."
            rows={4}
            maxLength={2000}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{editDetailsPrompt.length}/2000</p>
        </FormField>
        <CategoryFieldsPreview
          categories={categories}
          categoryId={editDetailsCategoryId}
          contentType={editDetailsContentType}
        />
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Template"
        description="This will permanently remove the template and its safe zones."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}

// ─── Category Fields Preview ──────────────────────────────────

const FIELD_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  TEXT: { label: "Text", color: "bg-blue-100 text-blue-700" },
  TEXTAREA: { label: "Textarea", color: "bg-blue-100 text-blue-700" },
  IMAGE: { label: "Image Upload", color: "bg-purple-100 text-purple-700" },
  COLOR: { label: "Color", color: "bg-pink-100 text-pink-700" },
  SELECT: { label: "Select", color: "bg-amber-100 text-amber-700" },
  NUMBER: { label: "Number", color: "bg-emerald-100 text-emerald-700" },
  PHONE: { label: "Phone", color: "bg-cyan-100 text-cyan-700" },
  EMAIL: { label: "Email", color: "bg-cyan-100 text-cyan-700" },
  URL: { label: "URL", color: "bg-gray-100 text-gray-700" },
};

function CategoryFieldsPreview({
  categories,
  categoryId,
  contentType,
}: {
  categories: CategoryData[];
  categoryId: string;
  contentType: string;
}) {
  const category = categories.find((c) => c.id === categoryId && c.contentType === contentType);
  if (!category) return null;

  const fields = category.fieldSchemas ?? [];
  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/20">
        <p className="font-medium text-amber-700 dark:text-amber-400">
          No fields configured for &quot;{category.name}&quot;
        </p>
        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
          Go to Categories → {category.name} → Fields to add text, image upload, or phone fields that users fill during generation.
        </p>
      </div>
    );
  }

  const imageFields = fields.filter((f) => f.fieldType === "IMAGE");

  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        Category Fields — {category.name}
        <span className="text-xs font-normal text-muted-foreground">({fields.length} field{fields.length !== 1 ? "s" : ""})</span>
      </p>
      <div className="mt-2 space-y-1.5">
        {fields
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((field) => {
            const typeInfo = FIELD_TYPE_LABELS[field.fieldType] ?? { label: field.fieldType, color: "bg-gray-100 text-gray-700" };
            return (
              <div key={field.id} className="flex items-center gap-2 text-xs">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
                <span className="font-medium text-foreground">{field.label}</span>
                <span className="text-muted-foreground">({field.fieldKey})</span>
                {field.isRequired && <span className="text-[10px] text-destructive">required</span>}
                {field.hasPosition && <span className="text-[10px] text-blue-500">has position</span>}
              </div>
            );
          })}
      </div>
      {imageFields.length > 0 && (
        <p className="mt-2 text-[11px] text-purple-600 dark:text-purple-400">
          This category has {imageFields.length} image upload field{imageFields.length > 1 ? "s" : ""} — users can upload photos (e.g. logos, portraits) during generation.
        </p>
      )}
    </div>
  );
}
