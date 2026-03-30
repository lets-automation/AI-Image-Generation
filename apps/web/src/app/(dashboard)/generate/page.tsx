"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useGenerationStore, type GenerationState,
  getLanguageFromCountry,
} from "@/stores/generation.store";
import { useRequireAuth } from "@/hooks/useAuth";
import { userApi, type TemplateDetail, type CategoryItem } from "@/lib/user-api";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import {
  TIER_CONFIGS,
  ALL_TIERS,
  POSITION_LABELS,
  ALL_POSITIONS,
  ORIENTATION_CONFIGS,
  ALL_ORIENTATIONS,
  type QualityTier,
  type Position,
  type Orientation,
} from "@ep/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, ChevronDown, CheckCircle2,
  ArrowLeft, Sparkles, Image as ImageIcon, Globe, Info, Users,
  Square, RectangleVertical, RectangleHorizontal, Smartphone, Monitor,
  Plus, Trash2, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface DynamicLanguage {
  id: string;
  code: string;
  label: string;
  nativeLabel: string;
  script: string;
  fontFamily: string;
  direction: string;
}

// ─── Collapsible Section ────────────────────────────────

function Section({
  title,
  subtitle,
  defaultOpen = true,
  complete,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  complete?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50">
          <div className="flex items-center gap-3">
            {complete !== undefined && (
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                complete ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
              )}>
                {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{title}</p>
              {subtitle && !open && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-1 pb-1 pt-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Preview Panel ──────────────────────────────────────

// Map position grid (row, col) to CSS alignment
const POSITION_CSS: Record<string, { row: string; col: string }> = {
  TOP_LEFT: { row: "start", col: "start" },
  TOP_CENTER: { row: "start", col: "center" },
  TOP_RIGHT: { row: "start", col: "end" },
  MIDDLE_LEFT: { row: "center", col: "start" },
  MIDDLE_CENTER: { row: "center", col: "center" },
  MIDDLE_RIGHT: { row: "center", col: "end" },
  BOTTOM_LEFT: { row: "end", col: "start" },
  BOTTOM_CENTER: { row: "end", col: "center" },
  BOTTOM_RIGHT: { row: "end", col: "end" },
};

interface OverlayEntry {
  fieldKey: string;
  value: string;
  position: Position;
  isImage: boolean;
}

function PreviewPanel({
  template,
  uploadedImageUrls,
  store,
  tierCreditCosts,
  dynamicLanguages,
  onGenerate,
  isGenerating,
}: {
  template: TemplateDetail | null;
  uploadedImageUrls: string[];
  store: Pick<GenerationState, "qualityTier" | "prompt" | "conflicts" | "fieldValues" | "positionMap" | "fieldSchemas" | "selectedLanguages">;
  tierCreditCosts: Record<QualityTier, number>;
  dynamicLanguages: DynamicLanguage[];
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const { user } = useAuthStore();
  const [genLimits, setGenLimits] = useState<{ dailyLimit: number; usedToday: number; remaining: number } | null>(null);

  useEffect(() => {
    apiClient.get("/generations/limits")
      .then(({ data }) => { if (data?.data) setGenLimits(data.data); })
      .catch(() => {});
  }, []);

  const imageUrl = template?.imageUrl ?? uploadedImageUrls[0] ?? null;
  const tierCfg = TIER_CONFIGS[store.qualityTier];
  const selectedTierCost = tierCreditCosts[store.qualityTier] ?? tierCfg.defaultCreditCost;
  const isCustomUpload = !template && uploadedImageUrls.length > 0;
  const numLanguages = isCustomUpload ? 1 : Math.max(1, store.selectedLanguages.length);
  const customOutputCount = 1;
  const totalCredits = selectedTierCost * numLanguages * customOutputCount;
  const hasTemplate = !!template || uploadedImageUrls.length > 0;
  const hasNoConflicts = store.conflicts.length === 0;
  const hasRemainingGenerations = !genLimits || genLimits.remaining > 0;
  const canGenerate = hasTemplate && hasNoConflicts && hasRemainingGenerations && !isGenerating;

  const autoLangCode = isCustomUpload ? getLanguageFromCountry(user?.country) : null;
  const autoLangLabel = autoLangCode ? dynamicLanguages.find(l => l.code === autoLangCode)?.nativeLabel || autoLangCode : "English";

  const resolveGroupedCompositeValue = (
    compositeKey: string
  ): { value: string | number; schemaKey: string } | null => {
    for (const [groupKey, groupValue] of Object.entries(store.fieldValues)) {
      if (!Array.isArray(groupValue)) continue;

      for (let i = 0; i < groupValue.length; i++) {
        const entry = groupValue[i];
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;

        for (const [subKey, subValue] of Object.entries(entry as Record<string, string | number>)) {
          if (`${groupKey}_${i + 1}_${subKey}` === compositeKey) {
            return { value: subValue, schemaKey: subKey };
          }
        }
      }
    }
    return null;
  };

  // Build overlay entries: fields that have both a value and a position.
  // Supports regular field keys and grouped composite keys.
  const overlayEntries: OverlayEntry[] = Object.entries(store.positionMap)
    .map(([key, position]) => {
      const directValue = store.fieldValues[key];
      const groupedValue = directValue === undefined ? resolveGroupedCompositeValue(key) : null;
      const rawValue = directValue ?? groupedValue?.value;

      if (rawValue === undefined || rawValue === null) return null;
      const textValue = String(rawValue).trim();
      if (!textValue) return null;

      const schemaKey = groupedValue?.schemaKey ?? key;
      const schema = store.fieldSchemas.find((s) => s.fieldKey === schemaKey);

      return {
        fieldKey: key,
        value: textValue,
        position,
        isImage: schema?.fieldType === "IMAGE",
      };
    })
    .filter((entry): entry is OverlayEntry => entry !== null);

  return (
    <div className="space-y-4">
      {/* Preview Image with text overlay */}
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        {imageUrl ? (
          <div>
            {/* Multiple uploaded images grid */}
            {isCustomUpload && uploadedImageUrls.length > 1 ? (
              <div className={`grid gap-1.5 p-2 ${uploadedImageUrls.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {uploadedImageUrls.map((url, idx) => (
                  <div key={idx} className="relative overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Uploaded image ${idx + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 pb-1 pt-3">
                      <span className="text-[9px] font-medium text-white/90">Image {idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Single image preview with overlay */
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={template?.name ?? "Preview"}
                  className="h-auto w-full"
                />

                {/* Live overlay grid */}
                {overlayEntries.length > 0 && (
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-2">
                    {overlayEntries.map((entry) => {
                      const css = POSITION_CSS[entry.position];
                      if (!css) return null;
                      return (
                        <div
                          key={entry.fieldKey}
                          className="pointer-events-none flex max-h-full max-w-full overflow-hidden"
                          style={{
                            gridRow: css.row === "start" ? 1 : css.row === "center" ? 2 : 3,
                            gridColumn: css.col === "start" ? 1 : css.col === "center" ? 2 : 3,
                            alignSelf: css.row === "start" ? "start" : css.row === "center" ? "center" : "end",
                            justifySelf: css.col as "start" | "center" | "end",
                          }}
                        >
                          {entry.isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.value}
                              alt="overlay"
                              className="h-8 w-8 rounded object-contain drop-shadow-md"
                            />
                          ) : (
                            <span
                              className="rounded-sm bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white drop-shadow-md"
                              style={{
                                textAlign: css.col === "end" ? "right" : css.col === "center" ? "center" : "left",
                              }}
                            >
                              {entry.value.length > 30 ? entry.value.slice(0, 30) + "..." : entry.value}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* "Preview" badge */}
                {overlayEntries.length > 0 && (
                  <div className="absolute bottom-2 left-2">
                    <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/80">
                      Live Preview
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="mx-auto h-10 w-10" />
              <p className="mt-2 text-sm">No template selected</p>
            </div>
          </div>
        )}
      </div>

      {/* Template info */}
      {template && (
        <div className="text-center">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="text-xs text-muted-foreground">
            {template.width} x {template.height}px -- {template.category.name}
          </p>
        </div>
      )}

      {/* Cost summary */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Quality</span>
          <span className="font-medium">{tierCfg.label}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Languages</span>
          {isCustomUpload ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <Globe className="h-3.5 w-3.5" />
              Auto-detect ({autoLangLabel})
            </span>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help items-center gap-1 font-medium">
                    <Globe className="h-3.5 w-3.5" />
                    {store.selectedLanguages.length === dynamicLanguages.length
                      ? `All ${dynamicLanguages.length}`
                      : `${store.selectedLanguages.length} of ${dynamicLanguages.length}`}
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="mb-1 text-xs font-semibold">
                    {store.selectedLanguages.length === dynamicLanguages.length
                      ? "Generating in all languages:"
                      : "Generating in selected languages:"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {store.selectedLanguages.map((lang) => {
                      const cfg = dynamicLanguages.find((l) => l.code === lang);
                      return (
                        <span key={lang} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {cfg?.nativeLabel ?? lang}
                        </span>
                      );
                    })}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cost</span>
          <span className="text-lg font-bold">
            {totalCredits} credits
          </span>
        </div>
        {(!isCustomUpload && numLanguages > 1) && (
          <p className="mt-1 text-[10px] text-muted-foreground text-right">
            {selectedTierCost} per language × {numLanguages} languages
          </p>
        )}
        {isCustomUpload && uploadedImageUrls.length > 1 && (
          <p className="mt-1 text-[10px] text-muted-foreground text-right">
            {uploadedImageUrls.length} images combined into 1 output
          </p>
        )}
      </div>

      {/* Daily generation limit info */}
      {genLimits && (
        <div className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-xs",
          genLimits.remaining <= 0
            ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
            : genLimits.remaining <= 10
              ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
              : "bg-muted text-muted-foreground"
        )}>
          <span>Daily limit</span>
          <span className="font-medium">
            {genLimits.remaining <= 0
              ? "Limit reached"
              : `${genLimits.remaining} of ${genLimits.dailyLimit} remaining`}
          </span>
        </div>
      )}

      {/* Generate button */}
      <Button
        className="w-full"
        size="lg"
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : genLimits && genLimits.remaining <= 0 ? (
          "Daily limit reached"
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate ({totalCredits} credits)
          </>
        )}
      </Button>

      {store.conflicts.length > 0 && (
        <p className="text-center text-xs text-destructive">
          Position conflicts detected -- fix before generating
        </p>
      )}
    </div>
  );
}

// ─── Single Field Input ──────────────────────────────────

function FieldInput({
  schema,
  store,
}: {
  schema: { fieldKey: string; label: string; fieldType: string; isRequired: boolean; hasPosition: boolean; placeholder: string | null; isRepeatable?: boolean; maxRepeat?: number };
  store: Pick<GenerationState, "fieldValues" | "positionMap" | "conflicts" | "setFieldValue" | "setPosition">;
}) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1">
        {schema.label}
        {schema.isRequired && <span className="text-destructive">*</span>}
      </Label>

      <div className={schema.hasPosition ? "flex items-start gap-3" : ""}>
        <div className={schema.hasPosition ? "flex-1 min-w-0" : ""}>
          {schema.fieldType === "TEXTAREA" ? (
            <Textarea
              value={(store.fieldValues[schema.fieldKey] as string) ?? ""}
              onChange={(e) => store.setFieldValue(schema.fieldKey, e.target.value)}
              placeholder={schema.placeholder ?? ""}
              rows={3}
            />
          ) : schema.fieldType === "IMAGE" ? (
            <div className="space-y-3">
              {(() => {
                const isRepeatable = !!schema.isRepeatable;
                const max = isRepeatable ? (schema.maxRepeat || 5) : 1;
                const rawValue = store.fieldValues[schema.fieldKey];
                
                // Normalize value to an array for rendering
                let images: string[] = [];
                if (rawValue) {
                  images = Array.isArray(rawValue) ? (rawValue as string[]) : [rawValue as string];
                }

                return (
                  <>
                    {/* Render existing uploaded images */}
                    {images.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {images.map((url, idx) => (
                          <div key={idx} className="relative inline-block shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${schema.label} - ${idx + 1}`}
                              className="h-24 w-24 rounded-lg border object-cover shadow-sm bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newImages = images.filter((_, i) => i !== idx);
                                if (isRepeatable) {
                                  store.setFieldValue(schema.fieldKey, (newImages.length > 0 ? newImages : "") as any);
                                } else {
                                  store.setFieldValue(schema.fieldKey, "");
                                }
                              }}
                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-destructive text-[12px] font-bold text-white shadow hover:scale-105 active:scale-95 transition-all"
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Styled dropzone — Show if under max repeat */}
                    {images.length < max && (
                      <label className={cn(
                        "relative flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors",
                        store.conflicts.some((c) => c.fields.includes(schema.fieldKey))
                          ? "border-destructive/60 bg-destructive/5 hover:bg-destructive/10"
                          : "border-blue-400/60 bg-blue-50/50 hover:bg-blue-50/90 dark:border-blue-800/60 dark:bg-blue-950/20 dark:hover:bg-blue-900/40"
                      )}>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div className="flex-1 space-y-1 pr-6">
                          <p className="font-semibold text-blue-700 dark:text-blue-300">
                            Upload your own image
                          </p>
                          <p className="text-xs text-muted-foreground">
                            JPG, PNG, WebP up to 10 MB
                          </p>
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80 mt-1">
                            <Info className="h-3 w-3" /> Recommended 1024x1024px+
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="absolute inset-0 hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = URL.createObjectURL(file);
                              if (isRepeatable) {
                                store.setFieldValue(schema.fieldKey, [...images, url] as any);
                              } else {
                                store.setFieldValue(schema.fieldKey, url);
                              }
                            }
                            // Reset input so same file can be selected again if deleted
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <>
              <Input
                type={schema.fieldType === "PHONE" || schema.fieldType === "NUMBER" ? "tel" : schema.fieldType === "EMAIL" ? "email" : "text"}
                value={(store.fieldValues[schema.fieldKey] as string) ?? ""}
                onChange={(e) => store.setFieldValue(schema.fieldKey, e.target.value)}
                placeholder={schema.placeholder ?? (schema.fieldType === "PHONE" ? "+91 9876543210" : schema.fieldType === "EMAIL" ? "email@example.com" : "")}
              />
              {schema.fieldType === "PHONE" && store.fieldValues[schema.fieldKey] && (() => {
                const phone = String(store.fieldValues[schema.fieldKey]).replace(/\s/g, "");
                const valid = /^\+?\d{7,15}$/.test(phone);
                return !valid ? (
                  <p className="mt-0.5 text-[11px] text-destructive">Enter a valid phone number (7-15 digits)</p>
                ) : null;
              })()}
              {schema.fieldType === "EMAIL" && store.fieldValues[schema.fieldKey] && (() => {
                const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(store.fieldValues[schema.fieldKey]));
                return !valid ? (
                  <p className="mt-0.5 text-[11px] text-destructive">Enter a valid email address</p>
                ) : null;
              })()}
            </>
          )}
        </div>

        {schema.hasPosition && (
          <div className="w-[160px] shrink-0">
            <p className="mb-1 text-[10px] text-muted-foreground">Position</p>
            <Select
              value={store.positionMap[schema.fieldKey] ?? ""}
              onValueChange={(value) => store.setPosition(schema.fieldKey, value as Position)}
            >
              <SelectTrigger className={cn(
                "w-full h-9 text-xs",
                store.conflicts.some((c) => c.fields.includes(schema.fieldKey))
                  ? "border-destructive text-destructive"
                  : ""
              )}>
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                {ALL_POSITIONS.map((pos) => {
                  const isConflict = store.conflicts.some(
                    (c) => c.position === pos && c.fields.includes(schema.fieldKey)
                  );
                  return (
                    <SelectItem key={pos} value={pos}>
                      <span className={isConflict ? "text-destructive" : ""}>
                        {POSITION_LABELS[pos].label}
                        {isConflict && " ⚠"}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {store.conflicts.some((c) => c.fields.includes(schema.fieldKey)) && (
              <p className="mt-0.5 text-[10px] text-destructive">Conflict</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Batch Views (extracted to batch-views.tsx) ─────────

import { ProcessingView, ResultView, type BatchResult } from "./batch-views";

// ─── Main Page ──────────────────────────────────────────

export default function GeneratePage() {
  const { isReady } = useRequireAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useGenerationStore();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [dynamicLanguages, setDynamicLanguages] = useState<DynamicLanguage[]>([]);
  const [tierCreditCosts, setTierCreditCosts] = useState<Record<QualityTier, number>>(() =>
    Object.fromEntries(ALL_TIERS.map((tier) => [tier, TIER_CONFIGS[tier].defaultCreditCost])) as Record<QualityTier, number>
  );
  const [isLoading, setIsLoading] = useState(true);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const templateId = searchParams.get("templateId");
    const contentType = searchParams.get("type") as "EVENT" | "POSTER" | null;

    if (contentType) store.setContentType(contentType);

    async function loadData() {
      try {
        const effectiveContentType = contentType ?? store.contentType ?? undefined;
        const [cats, langsRes, tierPricing] = await Promise.all([
          userApi.listCategories(effectiveContentType),
          apiClient.get<{ data: DynamicLanguage[] }>("/languages").then((r) => r.data.data),
          apiClient
            .get<{ success: boolean; data: Record<QualityTier, number> }>("/generations/tier-pricing")
            .then((r) => r.data.data)
            .catch(() => null),
        ]);
        setCategories(cats);
        setDynamicLanguages(langsRes);
        if (tierPricing) {
          setTierCreditCosts((prev) => ({ ...prev, ...tierPricing }));
        }

        if (templateId) {
          const tmpl = await userApi.getTemplate(templateId);
          setTemplate(tmpl);
          store.selectTemplate(tmpl as any);

          if (!contentType && tmpl.category?.contentType) {
            store.setContentType(tmpl.category.contentType);
          }

          if (tmpl.category?.fieldSchemas?.length) {
            store.selectCategory(tmpl.category as any);
          } else {
            try {
              const fullCat = await userApi.getCategory(tmpl.category.id);
              store.selectCategory(fullCat as any);
            } catch {
              const matchingCat = cats.find((c) => c.id === tmpl.category.id);
              if (matchingCat) store.selectCategory(matchingCat as any);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load generation data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCategory = useCallback(async (cat: CategoryItem) => {
    if (cat.fieldSchemas && cat.fieldSchemas.length > 0) {
      store.selectCategory(cat as any);
    } else {
      try {
        const fullCat = await userApi.getCategory(cat.id);
        store.selectCategory(fullCat as any);
      } catch {
        store.selectCategory(cat as any);
      }
    }
  }, [store]);

  const handleSubmit = useCallback(async () => {
    const customImageCount = store.uploadedImageUrls.length > 0
      ? store.uploadedImageUrls.length
      : (store.uploadedImageUrl ? 1 : 0);
    const isCustomUpload = !store.selectedTemplate && customImageCount > 0;

    // Validate required fields before submission
    if (!store.selectedTemplate && customImageCount === 0) {
      toast.error("Please select a template or upload an image");
      return;
    }
    if (!store.contentType) {
      toast.error("Content type not set. Please navigate from Events or Posters page.");
      return;
    }
    if (!isCustomUpload && !store.selectedCategory) {
      toast.error("Please select a category");
      return;
    }
    // Validate required field values
    const missingRequired = store.fieldSchemas
      .filter((s) => s.isRequired && !store.fieldValues[s.fieldKey])
      .map((s) => s.label);
    if (missingRequired.length > 0) {
      toast.error(`Required fields missing: ${missingRequired.join(", ")}`);
      return;
    }
    // Validate phone number format
    for (const schema of store.fieldSchemas) {
      const value = store.fieldValues[schema.fieldKey];
      if (!value) continue;
      if (schema.fieldType === "PHONE") {
        const phone = String(value).replace(/\s/g, "");
        if (!/^\+?\d{7,15}$/.test(phone)) {
          toast.error(`Invalid phone number for "${schema.label}". Use 7-15 digits, optionally starting with +`);
          return;
        }
      }
      if (schema.fieldType === "EMAIL") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
          toast.error(`Invalid email address for "${schema.label}"`);
          return;
        }
      }
    }
    if (store.conflicts.length > 0) {
      toast.error("Fix position conflicts before generating");
      return;
    }

    setError(null);
    setBatchResults([]);
    try {
      await store.submitGeneration();
      if (isCustomUpload) {
        const outputCount = 1;
        toast.success(
          outputCount > 1
            ? `Generation started! Processing ${outputCount} custom outputs...`
            : "Generation started! Processing custom output..."
        );
      } else {
        const langCount = store.selectedLanguages.length;
        toast.success(
          langCount === dynamicLanguages.length
            ? "Generation started! Processing all languages..."
            : `Generation started! Processing ${langCount} language${langCount > 1 ? "s" : ""}...`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
    }
  }, [store]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Processing / Result states
  if (store.phase === "processing" && store.batchId) {
    return (
      <div className="mx-auto max-w-4xl">
        <ProcessingView
          batchId={store.batchId}
          onComplete={(results) => { 
            store.reset(); 
            toast.success("Generation complete! Redirecting to downloads...");
            router.push("/downloads");
          }}
          onError={(msg) => { setError(msg); }}
        />
      </div>
    );
  }

  if (batchResults.length > 0 || error) {
    return (
      <div className="mx-auto max-w-4xl">
        <ResultView results={batchResults} error={error} />
      </div>
    );
  }

  // Main configure layout
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Generate Creative</h1>
          <p className="text-sm text-muted-foreground">Configure your image and generate</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Controls */}
        <div className="space-y-3">
          {/* Category */}
          {store.uploadedImageUrls.length === 0 && !store.uploadedImageUrl && (
            <Section
              title="Category"
              subtitle={store.selectedCategory?.name}
              complete={!!store.selectedCategory}
            >
              <div className="space-y-4">
                {/* Group categories: parents with children, standalone categories */}
                {(() => {
                  // Separate parents (with children) from standalone (no children, no parent)
                  const parents = categories.filter((c) => !c.parentId && c.children && c.children.length > 0);
                  const standalone = categories.filter((c) => !c.parentId && (!c.children || c.children.length === 0));

                  return (
                    <>
                      {parents.map((parent) => (
                        <div key={parent.id} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{parent.name}</p>
                            <div className="flex-1 border-t border-border" />
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {/* Parent itself as an option */}
                            <button
                              onClick={() => handleSelectCategory(parent)}
                              className={cn(
                                "rounded-lg border p-3 text-left transition-all",
                                store.selectedCategory?.id === parent.id
                                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                                  : "hover:border-foreground/20"
                              )}
                            >
                              <p className="text-sm font-medium">{parent.name}</p>
                              {parent.description && (
                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{parent.description}</p>
                              )}
                            </button>
                            {/* Sub-categories */}
                            {parent.children?.map((child) => (
                              <button
                                key={child.id}
                                onClick={() => handleSelectCategory(child)}
                                className={cn(
                                  "rounded-lg border p-3 text-left transition-all",
                                  store.selectedCategory?.id === child.id
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "hover:border-foreground/20"
                                )}
                              >
                                <p className="text-sm font-medium">{child.name}</p>
                                {child.description && (
                                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{child.description}</p>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Standalone categories (no children and no parent) */}
                      {standalone.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {standalone.map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => handleSelectCategory(cat)}
                              className={cn(
                                "rounded-lg border p-3 text-left transition-all",
                                store.selectedCategory?.id === cat.id
                                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                                  : "hover:border-foreground/20"
                              )}
                            >
                              <p className="text-sm font-medium">{cat.name}</p>
                              {cat.description && (
                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{cat.description}</p>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </Section>
          )}

          {/* Fields & Positions */}
          {store.fieldSchemas.length > 0 && (
            <Section
              title="Details & Positions"
              subtitle={(() => {
                const regularCount = store.fieldSchemas.filter((s) => !s.groupKey).length;
                const groupKeys = new Set(store.fieldSchemas.filter((s) => s.groupKey).map((s) => s.groupKey));
                const parts: string[] = [];
                if (regularCount > 0) parts.push(`${regularCount} field${regularCount !== 1 ? "s" : ""}`);
                if (groupKeys.size > 0) parts.push(`${groupKeys.size} group${groupKeys.size !== 1 ? "s" : ""}`);
                return parts.join(" + ");
              })()}
              complete={store.fieldSchemas.filter((s) => s.isRequired && !s.groupKey).every((s) => store.fieldValues[s.fieldKey])}
            >
              <div className="space-y-4">
                {/* Non-grouped fields */}
                {store.fieldSchemas.filter((s) => !s.groupKey).map((schema) => (
                  <FieldInput key={schema.fieldKey} schema={schema} store={store} />
                ))}

                {/* Grouped repeatable fields */}
                {(() => {
                  const groups = new Map<string, typeof store.fieldSchemas>();
                  for (const s of store.fieldSchemas) {
                    if (s.groupKey) {
                      if (!groups.has(s.groupKey)) groups.set(s.groupKey, []);
                      groups.get(s.groupKey)!.push(s);
                    }
                  }
                  if (groups.size === 0) return null;

                  return (
                    <>
                      {/* Separator between regular fields and groups */}
                      {store.fieldSchemas.some((s) => !s.groupKey) && (
                        <Separator className="my-1" />
                      )}

                      {Array.from(groups.entries()).map(([groupKey, schemas]) => {
                        const entries = (store.fieldValues[groupKey] as Array<Record<string, string | number>>) ?? [];
                        const maxRepeat = schemas[0]?.maxRepeat ?? 5;
                        const fieldKeys = schemas.map((s) => s.fieldKey);
                        const groupDisplayName = groupKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                        // Auto-add first entry if none exist
                        if (entries.length === 0) {
                          // Use setTimeout to avoid updating state during render
                          setTimeout(() => store.addGroupEntry(groupKey, fieldKeys), 0);
                        }

                        return (
                          <div key={groupKey} className="rounded-xl border-2 border-blue-200/70 bg-blue-50/20 dark:border-blue-900/50 dark:bg-blue-950/10 overflow-hidden">
                            {/* Group header */}
                            <div className="flex items-center justify-between border-b border-blue-200/50 bg-blue-50/60 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15">
                                  <Users className="h-3.5 w-3.5 text-blue-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                                    {groupDisplayName}
                                  </p>
                                  <p className="text-[11px] text-blue-600/70 dark:text-blue-400/60">
                                    {entries.length} of {maxRepeat} added
                                  </p>
                                </div>
                              </div>
                              {entries.length < maxRepeat && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                                  onClick={() => store.addGroupEntry(groupKey, fieldKeys)}
                                >
                                  <Plus className="mr-1 h-3 w-3" /> Add {groupDisplayName}
                                </Button>
                              )}
                            </div>

                            {/* Entries */}
                            <div className="space-y-3 p-3">
                              {entries.map((entry, idx) => (
                                <div key={idx} className="rounded-lg border border-blue-200/60 bg-white shadow-sm dark:border-blue-900/40 dark:bg-gray-900">
                                  {/* Entry header */}
                                  <div className="flex items-center justify-between border-b border-blue-100/60 px-3 py-2 dark:border-blue-900/30">
                                    <div className="flex items-center gap-2">
                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                        {idx + 1}
                                      </span>
                                      <span className="text-xs font-medium text-blue-800/80 dark:text-blue-300/80">
                                        {groupDisplayName} #{idx + 1}
                                      </span>
                                    </div>
                                    {entries.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => store.removeGroupEntry(groupKey, idx)}
                                      >
                                        <Trash2 className="mr-1 h-3 w-3" /> Remove
                                      </Button>
                                    )}
                                  </div>
                                  {/* Entry fields */}
                                  <div className="space-y-3 p-3">
                                    {schemas.map((schema) => {
                                      const compositePositionKey = `${groupKey}_${idx + 1}_${schema.fieldKey}`;
                                      const hasConflict = store.conflicts.some((c) => c.fields.includes(compositePositionKey));

                                      return (
                                        <div key={schema.fieldKey} className={schema.hasPosition ? "flex items-start gap-3" : ""}>
                                          <div className={schema.hasPosition ? "flex-1 min-w-0" : ""}>
                                            <Label className="mb-1 text-xs flex items-center gap-1">
                                              {schema.label}
                                              {schema.isRequired && <span className="text-destructive">*</span>}
                                            </Label>
                                            {schema.fieldType === "IMAGE" ? (
                                              <div className="space-y-3 mt-1">
                                                {entry[schema.fieldKey] ? (
                                                  <div className="relative inline-block shrink-0">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                      src={String(entry[schema.fieldKey])}
                                                      alt={schema.label}
                                                      className="h-24 w-24 rounded-lg border object-cover shadow-sm bg-white"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => store.setGroupFieldValue(groupKey, idx, schema.fieldKey, "")}
                                                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-destructive text-[12px] font-bold text-white shadow hover:scale-105 active:scale-95 transition-all"
                                                    >
                                                      x
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <label className="relative flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-blue-400/60 bg-blue-50/50 p-4 transition-colors hover:bg-blue-50/90 dark:border-blue-800/60 dark:bg-blue-950/20 dark:hover:bg-blue-900/40">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                                                      <Upload className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex-1 space-y-1 pr-4">
                                                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                                        Upload image
                                                      </p>
                                                      <p className="text-[10px] text-muted-foreground">
                                                        JPG, PNG, WebP up to 10 MB
                                                      </p>
                                                    </div>
                                                    <input
                                                      type="file"
                                                      accept="image/jpeg,image/png,image/webp"
                                                      className="absolute inset-0 hidden"
                                                      onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                          const url = URL.createObjectURL(file);
                                                          store.setGroupFieldValue(groupKey, idx, schema.fieldKey, url);
                                                        }
                                                        e.target.value = "";
                                                      }}
                                                    />
                                                  </label>
                                                )}
                                              </div>
                                            ) : schema.fieldType === "TEXTAREA" ? (
                                              <Textarea
                                                value={String(entry[schema.fieldKey] ?? "")}
                                                onChange={(e) => store.setGroupFieldValue(groupKey, idx, schema.fieldKey, e.target.value)}
                                                placeholder={schema.placeholder ?? ""}
                                                rows={2}
                                                className="text-xs"
                                              />
                                            ) : (
                                              <Input
                                                type={schema.fieldType === "PHONE" || schema.fieldType === "NUMBER" ? "tel" : schema.fieldType === "EMAIL" ? "email" : "text"}
                                                value={String(entry[schema.fieldKey] ?? "")}
                                                onChange={(e) => store.setGroupFieldValue(groupKey, idx, schema.fieldKey, e.target.value)}
                                                placeholder={schema.placeholder ?? ""}
                                                className="h-9 text-sm"
                                              />
                                            )}
                                          </div>

                                          {schema.hasPosition && (
                                            <div className="w-[150px] shrink-0">
                                              <p className="mb-1 text-[10px] text-muted-foreground">Position</p>
                                              <Select
                                                value={store.positionMap[compositePositionKey] ?? store.positionMap[schema.fieldKey] ?? ""}
                                                onValueChange={(value) => store.setPosition(compositePositionKey, value as Position)}
                                              >
                                                <SelectTrigger className={cn("h-9 text-xs", hasConflict ? "border-destructive text-destructive" : "") }>
                                                  <SelectValue placeholder="Position" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {ALL_POSITIONS.map((pos) => (
                                                    <SelectItem key={pos} value={pos}>
                                                      {POSITION_LABELS[pos].label}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              {hasConflict && (
                                                <p className="mt-0.5 text-[10px] text-destructive">Conflict</p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}

                              {/* Add more button at bottom */}
                              {entries.length > 0 && entries.length < maxRepeat && (
                                <button
                                  type="button"
                                  onClick={() => store.addGroupEntry(groupKey, fieldKeys)}
                                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-200/80 py-3 text-xs font-medium text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-blue-800/60 dark:text-blue-400 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add another {groupDisplayName} ({entries.length}/{maxRepeat})
                                </button>
                              )}

                              {entries.length >= maxRepeat && (
                                <p className="text-center text-[11px] text-muted-foreground">
                                  Maximum {maxRepeat} entries reached
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </Section>
          )}

          {/* Prompt */}
          <Section
            title="Creative Prompt (Optional)"
            subtitle={store.prompt ? `${store.prompt.slice(0, 40)}...` : "No prompt — AI will use template style"}
            complete={true}
          >
            <div className="flex flex-col gap-2">
              <Textarea
                id="generation-prompt"
                value={store.prompt}
                onChange={(e) => store.setPrompt(e.target.value)}
                placeholder="Optional — describe the style, mood, or customization you want. Leave empty to let AI decide based on the template."
                className="min-h-[120px] resize-none"
                maxLength={5000}
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {store.prompt.length}/5000
              </p>
            </div>
          </Section>

          {/* Languages */}
          {store.uploadedImageUrls.length === 0 && !store.uploadedImageUrl && (
            <Section
              title="Languages"
              subtitle={
                store.selectedLanguages.length === dynamicLanguages.length
                  ? "All languages"
                  : `${store.selectedLanguages.length} selected`
              }
              complete={store.selectedLanguages.length > 0}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Select which languages to generate
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => store.selectAllLanguages(dynamicLanguages.map((l) => l.code))}
                      className={cn(
                        "rounded px-2 py-1 text-xs transition-colors",
                        store.selectedLanguages.length === dynamicLanguages.length
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => store.deselectAllLanguages()}
                      className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {dynamicLanguages.map((lang) => {
                    const isSelected = store.selectedLanguages.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => store.toggleLanguage(lang.code)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-foreground/20"
                        )}
                      >
                        <p className="text-xs font-medium">{lang.label}</p>
                        <p className="text-[10px] text-muted-foreground">{lang.nativeLabel}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>
          )}

          {/* Output Size / Orientation */}
          <Section
            title="Output Size"
            subtitle={
              store.orientation
                ? ORIENTATION_CONFIGS[store.orientation].label
                : "Auto (based on template)"
            }
            complete={true}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Choose the aspect ratio for your generated image
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {ALL_ORIENTATIONS.map((orient) => {
                  const cfg = ORIENTATION_CONFIGS[orient];
                  const isSelected = store.orientation === orient;
                  const OrientIcon = {
                    SQUARE: Square,
                    PORTRAIT: RectangleVertical,
                    LANDSCAPE: RectangleHorizontal,
                    STORY: Smartphone,
                    WIDE: Monitor,
                  }[orient] ?? Square;
                  return (
                    <button
                      key={orient}
                      type="button"
                      onClick={() => store.setOrientation(orient as Orientation)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-foreground/20"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <OrientIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs font-medium">{cfg.label}</p>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {cfg.ratio} — {cfg.width}×{cfg.height}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                        {cfg.description.split(" — ")[1]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* Quality Tier */}
          <Section
            title="Quality Tier"
            subtitle={TIER_CONFIGS[store.qualityTier].label}
            complete={true}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {ALL_TIERS.map((tier) => {
                const cfg = TIER_CONFIGS[tier];
                const tierCost = tierCreditCosts[tier] ?? cfg.defaultCreditCost;
                const isSelected = store.qualityTier === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => store.setQualityTier(tier)}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-foreground/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{cfg.label}</p>
                      <Badge variant="secondary">{tierCost} credits</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{cfg.description}</p>
                    <p className="mt-1.5 text-xs font-medium text-primary">AI-powered</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Community Setting */}
          <Section
            title="Community Showcase"
            subtitle={store.isPublic ? "Approval requested" : "Keep private"}
            complete={true}
          >
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-1 pr-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Request Community Showcase</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submit your creation for admin review. Once approved, it will appear in the public
                  showcase for users in relevant countries based on the language you generate in.
                </p>
              </div>
              <Switch
                checked={store.isPublic}
                onCheckedChange={store.setIsPublic}
              />
            </div>
          </Section>
        </div>

        {/* Right: Preview (sticky) */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <PreviewPanel
            template={template}
            uploadedImageUrls={store.uploadedImageUrls.length > 0
              ? store.uploadedImageUrls
              : (store.uploadedImageUrl ? [store.uploadedImageUrl] : [])}
            store={store}
            tierCreditCosts={tierCreditCosts}
            dynamicLanguages={dynamicLanguages}
            onGenerate={handleSubmit}
            isGenerating={store.isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
