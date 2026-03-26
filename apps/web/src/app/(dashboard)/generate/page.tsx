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
  uploadedImageUrl,
  store,
  dynamicLanguages,
  onGenerate,
  isGenerating,
}: {
  template: TemplateDetail | null;
  uploadedImageUrl: string | null;
  store: Pick<GenerationState, "qualityTier" | "prompt" | "conflicts" | "fieldValues" | "positionMap" | "fieldSchemas" | "selectedLanguages">;
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

  const imageUrl = template?.imageUrl ?? uploadedImageUrl;
  const tierCfg = TIER_CONFIGS[store.qualityTier];
  const isCustomUpload = !template && !!uploadedImageUrl;
  const numLanguages = isCustomUpload ? 1 : Math.max(1, store.selectedLanguages.length);
  const hasTemplate = !!template || !!uploadedImageUrl;
  const hasNoConflicts = store.conflicts.length === 0;
  const hasRemainingGenerations = !genLimits || genLimits.remaining > 0;
  const canGenerate = hasTemplate && hasNoConflicts && hasRemainingGenerations && !isGenerating;

  const autoLangCode = isCustomUpload ? getLanguageFromCountry(user?.country) : null;
  const autoLangLabel = autoLangCode ? dynamicLanguages.find(l => l.code === autoLangCode)?.nativeLabel || autoLangCode : "English";

  // Build overlay entries: fields that have both a value and a position
  const overlayEntries: OverlayEntry[] = Object.entries(store.positionMap)
    .filter(([key]) => store.fieldValues[key])
    .map(([key, position]) => {
      const schema = store.fieldSchemas.find((s) => s.fieldKey === key);
      return {
        fieldKey: key,
        value: String(store.fieldValues[key]),
        position,
        isImage: schema?.fieldType === "IMAGE",
      };
    });

  return (
    <div className="space-y-4">
      {/* Preview Image with text overlay */}
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        {imageUrl ? (
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
            {tierCfg.defaultCreditCost * numLanguages} credits
          </span>
        </div>
        {!isCustomUpload && numLanguages > 1 && (
          <p className="mt-1 text-[10px] text-muted-foreground text-right">
            {tierCfg.defaultCreditCost} per language × {numLanguages} languages
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
            Generate ({tierCfg.defaultCreditCost} credits)
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
        const [cats, langsRes] = await Promise.all([
          userApi.listCategories(effectiveContentType),
          apiClient.get<{ data: DynamicLanguage[] }>("/languages").then((r) => r.data.data),
        ]);
        setCategories(cats);
        setDynamicLanguages(langsRes);

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
    const isCustomUpload = !store.selectedTemplate && !!store.uploadedImageUrl;

    // Validate required fields before submission
    if (!store.selectedTemplate && !store.uploadedImageUrl) {
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
      const langCount = store.selectedLanguages.length;
      toast.success(
        langCount === dynamicLanguages.length
          ? "Generation started! Processing all languages..."
          : `Generation started! Processing ${langCount} language${langCount > 1 ? "s" : ""}...`
      );
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
          {!store.uploadedImageUrl && (
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
              subtitle={`${Object.keys(store.fieldValues).length} of ${store.fieldSchemas.length} filled`}
              complete={store.fieldSchemas.filter((s) => s.isRequired).every((s) => store.fieldValues[s.fieldKey])}
            >
              <div className="space-y-4">
                {store.fieldSchemas.map((schema) => (
                  <div key={schema.fieldKey}>
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
                          <div className="space-y-2">
                            {store.fieldValues[schema.fieldKey] ? (
                              <div className="relative inline-block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={store.fieldValues[schema.fieldKey] as string}
                                  alt={schema.label}
                                  className="h-20 w-20 rounded-md border object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => store.setFieldValue(schema.fieldKey, "")}
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                                >
                                  x
                                </button>
                              </div>
                            ) : null}
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const url = URL.createObjectURL(file);
                                  store.setFieldValue(schema.fieldKey, url);
                                }
                              }}
                            />
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
                ))}
              </div>
            </Section>
          )}

          {/* Prompt */}
          <Section
            title="Creative Prompt (Optional)"
            subtitle={store.prompt ? `${store.prompt.slice(0, 40)}...` : "No prompt — AI will use template style"}
            complete={true}
          >
            <Textarea
              value={store.prompt}
              onChange={(e) => store.setPrompt(e.target.value)}
              placeholder="Optional — describe the style, mood, or customization you want. Leave empty to let AI decide based on the template."
              rows={4}
              maxLength={500}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{store.prompt.length}/500</p>
          </Section>

          {/* Languages */}
          {!store.uploadedImageUrl && (
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
                      <Badge variant="secondary">{cfg.defaultCreditCost} credits</Badge>
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
            uploadedImageUrl={store.uploadedImageUrl}
            store={store}
            dynamicLanguages={dynamicLanguages}
            onGenerate={handleSubmit}
            isGenerating={store.isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
