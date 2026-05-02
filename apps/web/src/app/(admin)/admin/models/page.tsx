"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "@/lib/admin-api";
import toast from "react-hot-toast";
import {
  PageHeader, DataTable, FormDialog, FormField, ConfirmDialog,
  StatusBadge, LoadingState, type ColumnDef,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, MoreHorizontal, Pencil, Power, Trash2, Info, HelpCircle, KeyRound, Save, Eye, EyeOff } from "lucide-react";

interface ModelPricing {
  id: string;
  qualityTier: "BASIC" | "STANDARD" | "PREMIUM";
  providerName: string;
  modelId: string;
  creditCost: number;
  isActive: boolean;
  priority: number;
  config: Record<string, unknown> | null;
  createdAt: string;
}

const TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;

const TIER_LABELS: Record<string, string> = {
  BASIC: "Basic (fast AI generation)",
  STANDARD: "Standard (balanced AI generation)",
  PREMIUM: "Premium (highest quality AI)",
};

/** Default quality settings per tier (used when creating new entries) */
const TIER_QUALITY_DEFAULTS: Record<string, string> = {
  BASIC: "low",
  STANDARD: "medium",
  PREMIUM: "high",
};

/** Known providers with their docs and model suggestions */
const KNOWN_PROVIDERS: Record<string, {
  label: string;
  models: { id: string; label: string }[];
  docs: string;
  configHints: string;
}> = {
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-image-2", label: "GPT Image 2 (best text rendering, multilingual)" },
      { id: "gpt-image-1.5", label: "GPT Image 1.5 (if enabled on your account)" },
      { id: "gpt-image-1", label: "GPT Image 1 (balanced)" },
      { id: "gpt-image-1-mini", label: "GPT Image 1 Mini (fast)" },
    ],
    docs: "https://platform.openai.com/docs/guides/images",
    configHints: "Config fields: quality (low/medium/high). gpt-image-2 has improved text rendering, multilingual support, and processes reference images at high fidelity automatically. Template image is used as style reference via /images/edits.",
  },
  ideogram: {
    label: "Ideogram",
    models: [
      { id: "V_3", label: "V3 (latest, best text rendering)" },
      { id: "V_2_TURBO", label: "V2 Turbo (fast, good text)" },
      { id: "V_2", label: "V2 (balanced)" },
      { id: "V_2A_TURBO", label: "V2A Turbo (fast, artistic)" },
      { id: "V_2A", label: "V2A (artistic, detailed)" },
    ],
    docs: "https://developer.ideogram.ai/api-reference",
    configHints: "Config fields: style_type (DESIGN/GENERAL/REALISTIC), image_weight (0-100, recommended: BASIC 58, STANDARD 64, PREMIUM 70). magic_prompt is OFF to preserve structured prompts.",
  },
  gemini: {
    label: "Google Gemini",
    models: [
      { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash (fast, efficient)" },
      { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash (best speed+quality)" },
      { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro (highest quality)" },
    ],
    docs: "https://ai.google.dev/gemini-api/docs/image-generation",
    configHints: "Config fields: costCents (provider cost). Uses generateContent with responseModalities: IMAGE. Supports reference images natively via multimodal input.",
  },
};

/** Structured config fields for AI image generation */
interface ModelConfig {
  // OpenAI fields
  quality: string;
  // Ideogram fields
  style_type: string;
  image_weight: number;
  // Common — stored as cents in DB, displayed as USD in UI
  costUsd: number;
}

/** Default Ideogram style types per tier */
const TIER_STYLE_DEFAULTS: Record<string, string> = {
  BASIC: "DESIGN",
  STANDARD: "DESIGN",
  PREMIUM: "DESIGN",
};

const TIER_IMAGE_WEIGHT_DEFAULTS: Record<string, number> = {
  BASIC: 58,
  STANDARD: 64,
  PREMIUM: 70,
};

function configToStructured(config: Record<string, unknown> | null, tier: string): ModelConfig {
  const costCents = (config?.costCents as number) ?? 8;
  return {
    quality: (config?.quality as string) ?? TIER_QUALITY_DEFAULTS[tier] ?? "medium",
    style_type: (config?.style_type as string) ?? TIER_STYLE_DEFAULTS[tier] ?? "DESIGN",
    image_weight: (config?.image_weight as number) ?? TIER_IMAGE_WEIGHT_DEFAULTS[tier] ?? 64,
    costUsd: costCents / 100,
  };
}

function structuredToConfig(cfg: ModelConfig, provider: string): Record<string, unknown> {
  const costCents = Math.round(cfg.costUsd * 100 * 100) / 100; // preserve 2 decimal places in cents
  if (provider === "ideogram") {
    return {
      style_type: cfg.style_type,
      image_weight: cfg.image_weight,
      costCents,
    };
  }
  if (provider === "gemini") {
    return {
      costCents,
    };
  }
  // OpenAI (default)
  return {
    quality: cfg.quality,
    costCents,
  };
}

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="ml-1 inline h-3.5 w-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Form state
  const [qualityTier, setQualityTier] = useState<"BASIC" | "STANDARD" | "PREMIUM">("STANDARD");
  const [providerName, setProviderName] = useState("");
  const [modelId, setModelId] = useState("");
  const [customModelId, setCustomModelId] = useState(""); // separate state for custom model input
  const [creditCost, setCreditCost] = useState(5);
  const [priority, setPriority] = useState(0);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    quality: "medium", style_type: "DESIGN", image_weight: TIER_IMAGE_WEIGHT_DEFAULTS.STANDARD, costUsd: 0.08,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const tier = filterTier === "ALL" ? undefined : filterTier;
      const data = await adminApi.listModelPricing(tier);
      setModels(data as ModelPricing[]);
    } catch {
      toast.error("Failed to load model pricing");
    } finally {
      setLoading(false);
    }
  }, [filterTier]);

  useEffect(() => { load(); }, [load]);

  // ─── API Key state ─────────────────────────────────────────
  type CredentialEntry = { key: string; label: string; group: string; maskedValue: string; source: "db" | "env" | "not_set" };
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credSaving, setCredSaving] = useState<string | null>(null);
  const [credVisible, setCredVisible] = useState<Record<string, boolean>>({});

  const loadCredentials = useCallback(async () => {
    try {
      const data = await adminApi.getCredentials();
      setCredentials(data.filter((c) => c.group === "ai"));
    } catch {
      // Silently fail — may not be SUPER_ADMIN
    }
  }, []);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  async function saveCredential(key: string) {
    const value = credValues[key];
    if (!value?.trim()) {
      toast.error("Please enter a value");
      return;
    }
    setCredSaving(key);
    try {
      await adminApi.updateCredential(key, value.trim());
      toast.success("API key saved");
      setCredValues((prev) => ({ ...prev, [key]: "" }));
      loadCredentials();
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setCredSaving(null);
    }
  }

  // Auto-apply tier defaults when tier changes
  useEffect(() => {
    if (!editId) {
      setModelConfig((prev) => ({
        ...prev,
        quality: TIER_QUALITY_DEFAULTS[qualityTier] ?? "medium",
        style_type: TIER_STYLE_DEFAULTS[qualityTier] ?? "DESIGN",
        image_weight: TIER_IMAGE_WEIGHT_DEFAULTS[qualityTier] ?? 64,
      }));
    }
  }, [qualityTier, editId]);

  function resetForm() {
    setQualityTier("STANDARD");
    setProviderName("");
    setModelId("");
    setCustomModelId("");
    setCreditCost(5);
    setPriority(0);
    setModelConfig({
      quality: "medium", style_type: "DESIGN", image_weight: TIER_IMAGE_WEIGHT_DEFAULTS.STANDARD, costUsd: 0.08,
    });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(m: ModelPricing) {
    setEditId(m.id);
    setQualityTier(m.qualityTier);
    setProviderName(m.providerName);
    setModelId(m.modelId);
    setCreditCost(m.creditCost);
    setPriority(m.priority);
    setModelConfig(configToStructured(m.config, m.qualityTier));
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!providerName.trim()) {
      toast.error("Provider name is required");
      return;
    }
    // Resolve the effective model ID — custom input takes over when "_custom_model" is selected
    const effectiveModelId = modelId === "_custom_model" ? customModelId : modelId;
    if (!effectiveModelId.trim()) {
      toast.error("Model ID is required");
      return;
    }

    const config = structuredToConfig(modelConfig, providerName.toLowerCase());

    try {
      if (editId) {
        await adminApi.updateModelPricing(editId, { creditCost, priority, config, isActive: true });
        toast.success("Model pricing updated");
      } else {
        await adminApi.createModelPricing({
          qualityTier,
          providerName: providerName.toLowerCase(),
          modelId: effectiveModelId,
          creditCost,
          priority,
          config,
        });
        toast.success("Model pricing created");
      }
      resetForm();
      load();
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteModelPricing(deleteTarget);
      toast.success("Deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleToggle(m: ModelPricing) {
    try {
      await adminApi.updateModelPricing(m.id, { isActive: !m.isActive });
      load();
    } catch {
      toast.error("Failed to toggle");
    }
  }

  const providerInfo = KNOWN_PROVIDERS[providerName.toLowerCase()];

  const grouped = TIERS.reduce((acc, tier) => {
    acc[tier] = models
      .filter((m) => filterTier === "ALL" || m.qualityTier === filterTier)
      .filter((m) => m.qualityTier === tier)
      .sort((a, b) => b.priority - a.priority);
    return acc;
  }, {} as Record<string, ModelPricing[]>);

  const makeColumns = (): ColumnDef<ModelPricing>[] => [
    {
      key: "priority",
      header: "#",
      className: "w-12",
      cell: (row) => (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
          {row.priority}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => (
        <span className="font-medium">
          {KNOWN_PROVIDERS[row.providerName]?.label ?? row.providerName}
        </span>
      ),
    },
    {
      key: "model",
      header: "Model",
      cell: (row) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {row.modelId}
        </code>
      ),
    },
    {
      key: "config",
      header: "Config",
      cell: (row) => {
        const c = row.config;
        if (!c) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {c.quality != null && (
              <Badge variant="outline" className="text-[10px] py-0">
                {String(c.quality)}
              </Badge>
            )}
            {c.style_type != null && (
              <Badge variant="outline" className="text-[10px] py-0">
                {String(c.style_type)}
              </Badge>
            )}
            {c.image_weight != null && (
              <Badge variant="outline" className="text-[10px] py-0">
                wt:{String(c.image_weight)}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "cost",
      header: "Cost",
      cell: (row) => (
        <span>
          <span className="font-semibold">{row.creditCost}</span>
          <span className="ml-1 text-xs text-muted-foreground">credits</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge active={row.isActive} />,
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
              <Power className="mr-2 h-4 w-4" /> {row.isActive ? "Disable" : "Enable"}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(row.id)}>
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
        title="AI Model Routing"
        description="Configure providers, models, and pricing for each quality tier"
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Model
          </Button>
        }
      />

      <Tabs value={filterTier} onValueChange={setFilterTier} className="mb-6">
        <TabsList>
          <TabsTrigger value="ALL">All Tiers</TabsTrigger>
          {TIERS.map((t) => (
            <TabsTrigger key={t} value={t}>{TIER_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* API Keys Section */}
      {credentials.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              AI Provider API Keys
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Set API keys here to override environment variables. Keys saved here take priority over .env values.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {credentials.map((cred) => (
                <div key={cred.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">{cred.label}</label>
                    <Badge
                      variant={cred.source === "db" ? "default" : cred.source === "env" ? "secondary" : "outline"}
                      className="text-[10px] py-0"
                    >
                      {cred.source === "db" ? "DB" : cred.source === "env" ? "ENV" : "NOT SET"}
                    </Badge>
                  </div>
                  {cred.maskedValue && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Current: {cred.maskedValue}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={credVisible[cred.key] ? "text" : "password"}
                        value={credValues[cred.key] ?? ""}
                        onChange={(e) => setCredValues((prev) => ({ ...prev, [cred.key]: e.target.value }))}
                        placeholder="Enter new key..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setCredVisible((prev) => ({ ...prev, [cred.key]: !prev[cred.key] }))}
                      >
                        {credVisible[cred.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveCredential(cred.key)}
                      disabled={credSaving === cred.key || !credValues[cred.key]?.trim()}
                    >
                      <Save className="mr-1 h-3.5 w-3.5" />
                      {credSaving === cred.key ? "..." : "Save"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {TIERS.map((tier) => {
            const tierModels = grouped[tier];
            if (filterTier !== "ALL" && filterTier !== tier) return null;

            return (
              <div key={tier}>
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant={tier === "PREMIUM" ? "default" : "secondary"}>
                    {TIER_LABELS[tier]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {tierModels.length} provider{tierModels.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {tierModels.length === 0 ? (
                  <p className="ml-2 text-sm text-muted-foreground">
                    No providers configured for this tier.
                  </p>
                ) : (
                  <DataTable
                    columns={makeColumns()}
                    data={tierModels}
                    rowKey={(r) => r.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <Card className="mt-8">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4" /> How Routing Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <ul className="list-inside list-disc space-y-1">
            <li>Active provider with the <strong>highest priority number</strong> is selected first.</li>
            <li>If that provider&apos;s circuit breaker is open (too many failures), the next priority provider is used automatically.</li>
            <li>All tiers use <strong>AI generation</strong>. The template image is used as a style reference — the AI generates a new poster matching the style.</li>
            <li><strong>quality</strong> controls output fidelity (low/medium/high). Size is determined by frontend orientation choices.</li>
            <li>Cost guard blocks higher tiers first when daily spend approaches limits.</li>
          </ul>
          <div className="mt-3 rounded bg-muted/50 p-3">
            <p className="font-medium text-foreground mb-1">Available providers:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li><strong>OpenAI</strong> — Best overall quality. <strong>gpt-image-2</strong> (Apr 2026) brings significantly improved text rendering, multilingual character support (Devanagari, Arabic, CJK), and better layout adherence. Uses /images/edits with template as style reference.</li>
              <li><strong>Ideogram</strong> — Best text rendering accuracy. Uses /remix with template as style reference. Ideal for phone numbers and multi-language text.</li>
              <li><strong>Google Gemini</strong> — Fast and efficient. Uses generateContent with image modality. Good balance of speed, quality, and cost.</li>
            </ul>
            <p className="font-medium text-foreground mb-1 mt-2">Multi-provider fallback:</p>
            <p>Add multiple provider entries for the same tier with different priorities. If one provider fails (circuit breaker), the system auto-routes to the next one.</p>
          </div>
        </CardContent>
      </Card>

      {/* Form Dialog — structured config instead of raw JSON */}
      <FormDialog
        open={showForm}
        onOpenChange={(open) => { if (!open) resetForm(); }}
        title={editId ? "Edit Model Pricing" : "New Model Pricing"}
        description={editId
          ? "Update the pricing and AI configuration for this model."
          : "Add a new AI provider and model for image generation."
        }
        onSubmit={handleSubmit}
        submitLabel={editId ? "Update Configuration" : "Create Configuration"}
        maxWidth="sm:max-w-[600px]"
      >
        {/* Row 1: Tier + Provider */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Quality Tier" required>
            <Select
              value={qualityTier}
              onValueChange={(v) => setQualityTier(v as "BASIC" | "STANDARD" | "PREMIUM")}
              disabled={!!editId}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Provider" required>
            <Select
              value={providerName}
              onValueChange={(v) => {
                setProviderName(v);
                setModelId("");
              }}
              disabled={!!editId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KNOWN_PROVIDERS).map(([key, info]) => (
                  <SelectItem key={key} value={key}>{info.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        {/* Provider info banner */}
        {providerInfo && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs">
            <p className="font-medium text-blue-900 dark:text-blue-200">{providerInfo.label}</p>
            <p className="text-blue-700 dark:text-blue-300 mt-0.5">{providerInfo.configHints}</p>
            <a
              href={providerInfo.docs}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline mt-1 inline-block"
            >
              API Documentation
            </a>
          </div>
        )}

        {/* Row 2: Model + Cost + Priority */}
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Model ID" required>
            {providerInfo ? (
              <Select value={modelId} onValueChange={setModelId} disabled={!!editId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  {providerInfo.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                  <SelectItem value="_custom_model">Custom...</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="Model identifier"
                required
                disabled={!!editId}
              />
            )}
            {modelId === "_custom_model" && (
              <Input
                className="mt-2"
                placeholder="Enter model ID..."
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                autoFocus
              />
            )}
          </FormField>

          <FormField label="Credit Cost" required description="Credits deducted per generation">
            <Input
              type="number"
              min={1}
              value={creditCost}
              onChange={(e) => setCreditCost(+e.target.value)}
              required
            />
          </FormField>

          <FormField label="Priority" description="Higher = tried first (recommended: primary 100, fallback 50)">
            <Input
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(+e.target.value)}
            />
          </FormField>
        </div>

        {/* Generation Settings — provider-specific */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Generation Settings</h4>

          {providerName === "ideogram" ? (
            /* Ideogram-specific config */
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">
                  Style Type
                  <HelpTip text="Ideogram style preset. DESIGN = posters/marketing, GENERAL = versatile, REALISTIC = photo-realistic, RENDER_3D = 3D style, ANIME = anime/manga style." />
                </Label>
                <Select
                  value={modelConfig.style_type}
                  onValueChange={(v) => setModelConfig({ ...modelConfig, style_type: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DESIGN">Design (posters)</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="REALISTIC">Realistic</SelectItem>
                    <SelectItem value="RENDER_3D">3D Render</SelectItem>
                    <SelectItem value="ANIME">Anime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  Image Weight (0-100)
                  <HelpTip text="How closely the output matches the reference template style. 0 = ignore reference, 50 = balanced, 100 = closely match reference. Default: 50." />
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={modelConfig.image_weight}
                  onChange={(e) => setModelConfig({ ...modelConfig, image_weight: +e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">
                  Provider Cost (USD)
                  <HelpTip text="Estimated cost per generation in USD. e.g. 0.013 = $0.013 per image. Used by the cost guard to track daily AI spend." />
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.001}
                  value={modelConfig.costUsd}
                  onChange={(e) => setModelConfig({ ...modelConfig, costUsd: +e.target.value })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = {(modelConfig.costUsd * 100).toFixed(2)}¢ per generation
                </p>
              </div>
            </div>
          ) : providerName === "gemini" ? (
            /* Gemini config — cost only (quality/size handled via responseModalities) */
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">
                  Provider Cost (USD)
                  <HelpTip text="Estimated cost per generation in USD. e.g. 0.005 = $0.005 per image. Used by the cost guard to track daily AI spend." />
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.001}
                  value={modelConfig.costUsd}
                  onChange={(e) => setModelConfig({ ...modelConfig, costUsd: +e.target.value })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = {(modelConfig.costUsd * 100).toFixed(2)}¢ per generation
                </p>
              </div>
              <div className="col-span-2 flex items-center">
                <p className="text-xs text-muted-foreground">
                  Gemini handles quality and resolution automatically. No additional config needed.
                </p>
              </div>
            </div>
          ) : (
            /* OpenAI config (default) */
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">
                  Quality
                  <HelpTip text="AI generation quality level. 'low' = fast/cheap, 'medium' = balanced, 'high' = best quality. Maps to the provider's quality parameter." />
                </Label>
                <Select
                  value={modelConfig.quality}
                  onValueChange={(v) => setModelConfig({ ...modelConfig, quality: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (fast)</SelectItem>
                    <SelectItem value="medium">Medium (balanced)</SelectItem>
                    <SelectItem value="high">High (best)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  Provider Cost (USD)
                  <HelpTip text="Estimated cost per generation in USD. e.g. 0.013 = $0.013 per image. Used by the cost guard to track daily AI spend." />
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.001}
                  value={modelConfig.costUsd}
                  onChange={(e) => setModelConfig({ ...modelConfig, costUsd: +e.target.value })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = {(modelConfig.costUsd * 100).toFixed(2)}¢ per generation
                </p>
              </div>
            </div>
          )}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Model Pricing"
        description="Remove this provider configuration? This will affect generation routing."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
