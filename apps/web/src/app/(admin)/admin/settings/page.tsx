"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "@/lib/admin-api";
import toast from "react-hot-toast";
import { PageHeader, LoadingState } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, CreditCard, Apple, Eye, EyeOff } from "lucide-react";

interface ConfigEntry {
  key: string;
  value: string | number;
  label: string;
  description: string;
  type: "number" | "text";
  suffix?: string;
}

const CONFIG_DEFINITIONS: ConfigEntry[] = [
  {
    key: "daily_ai_budget_cents",
    value: 10000,
    label: "Daily AI Budget",
    description: "Maximum daily spend on AI providers (in cents). $100 = 10000 cents.",
    type: "number",
    suffix: "cents",
  },
  {
    key: "cost_warning_threshold_percent",
    value: 70,
    label: "Warning Threshold",
    description: "At this % of daily budget, a warning is logged. No tiers are blocked.",
    type: "number",
    suffix: "%",
  },
  {
    key: "cost_critical_threshold_percent",
    value: 90,
    label: "Critical Threshold",
    description: "At this % of daily budget, PREMIUM tier is blocked. BASIC and STANDARD still allowed.",
    type: "number",
    suffix: "%",
  },
  {
    key: "cost_emergency_threshold_percent",
    value: 100,
    label: "Emergency Threshold",
    description: "At this % of daily budget, PREMIUM + STANDARD are blocked. BASIC falls back to overlay rendering.",
    type: "number",
    suffix: "%",
  },
  {
    key: "daily_generation_cap",
    value: 50,
    label: "Daily Generation Cap (per user)",
    description: "Maximum number of generation requests a single user can make per day. Each batch (10 languages) counts as 10.",
    type: "number",
  },
];

// ─── Credential field definitions ──────────────────────────

type CredentialEntry = {
  key: string;
  label: string;
  group: string;
  maskedValue: string;
  source: "db" | "env" | "not_set";
};

interface CredFieldDef {
  key: string;
  label: string;
  type: "password" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
}

const RAZORPAY_FIELDS: CredFieldDef[] = [
  { key: "razorpay_key_id", label: "Key ID", type: "password", placeholder: "rzp_live_..." },
  { key: "razorpay_key_secret", label: "Key Secret", type: "password", placeholder: "Enter key secret..." },
  { key: "razorpay_webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Enter webhook secret..." },
];

const APPLE_FIELDS: CredFieldDef[] = [
  { key: "apple_key_id", label: "Key ID", type: "password", placeholder: "e.g. V7YFD8FUAG" },
  { key: "apple_issuer_id", label: "Issuer ID", type: "password", placeholder: "e.g. 275f8bf8-..." },
  { key: "apple_bundle_id", label: "Bundle ID", type: "password", placeholder: "e.g. com.example.app" },
  { key: "apple_private_key", label: "Private Key (ES256)", type: "textarea", placeholder: "Paste PKCS#8 private key..." },
  { key: "apple_environment", label: "Environment", type: "select", options: ["Sandbox", "Production"] },
];

export default function AdminSettingsPage() {
  const [configs, setConfigs] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Credential state
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credSaving, setCredSaving] = useState<string | null>(null);
  const [credVisible, setCredVisible] = useState<Record<string, boolean>>({});

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listSystemConfig();
      const map: Record<string, string | number> = {};
      for (const cfg of data) {
        try {
          map[cfg.key] = JSON.parse(String(cfg.value));
        } catch {
          map[cfg.key] = String(cfg.value);
        }
      }
      setConfigs(map);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      const data = await adminApi.getCredentials();
      setCredentials(data);
    } catch {
      // Silently fail — may not be SUPER_ADMIN
    }
  }, []);

  useEffect(() => { loadConfigs(); loadCredentials(); }, [loadConfigs, loadCredentials]);

  function getValue(key: string, defaultValue: string | number): string | number {
    return configs[key] ?? defaultValue;
  }

  function setValue(key: string, val: string | number) {
    setConfigs((prev) => ({ ...prev, [key]: val }));
  }

  async function saveConfig(key: string, value: string | number) {
    setSaving(key);
    try {
      const numVal = typeof value === "string" ? parseFloat(value) : value;
      if (isNaN(numVal)) {
        toast.error("Please enter a valid number");
        return;
      }
      await adminApi.updateSystemConfig(key, numVal);
      toast.success("Setting saved");
    } catch {
      toast.error("Failed to save setting");
    } finally {
      setSaving(null);
    }
  }

  async function saveCredential(key: string) {
    const value = credValues[key];
    if (!value?.trim()) {
      toast.error("Please enter a value");
      return;
    }
    setCredSaving(key);
    try {
      await adminApi.updateCredential(key, value.trim());
      toast.success("Credential saved");
      setCredValues((prev) => ({ ...prev, [key]: "" }));
      loadCredentials();
    } catch {
      toast.error("Failed to save credential");
    } finally {
      setCredSaving(null);
    }
  }

  function getCredMeta(key: string): CredentialEntry | undefined {
    return credentials.find((c) => c.key === key);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="System Settings" description="Configure cost guardrails, generation limits, and other system parameters" />
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  const budgetCents = Number(getValue("daily_ai_budget_cents", 10000));
  const budgetDollars = (budgetCents / 100).toFixed(2);

  function renderCredField(field: CredFieldDef) {
    const meta = getCredMeta(field.key);
    return (
      <div key={field.key} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{field.label}</label>
          {meta && (
            <Badge
              variant={meta.source === "db" ? "default" : meta.source === "env" ? "secondary" : "outline"}
              className="text-[10px] py-0"
            >
              {meta.source === "db" ? "DB" : meta.source === "env" ? "ENV" : "NOT SET"}
            </Badge>
          )}
        </div>
        {meta?.maskedValue && (
          <p className="text-xs text-muted-foreground font-mono">
            Current: {meta.maskedValue}
          </p>
        )}
        <div className="flex items-start gap-2">
          {field.type === "textarea" ? (
            <Textarea
              value={credValues[field.key] ?? ""}
              onChange={(e) => setCredValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              rows={3}
              className="flex-1 font-mono text-xs"
            />
          ) : field.type === "select" ? (
            <Select
              value={credValues[field.key] || ""}
              onValueChange={(v) => setCredValues((prev) => ({ ...prev, [field.key]: v }))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={meta?.maskedValue ? `Current: ${meta.maskedValue}` : "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="relative flex-1">
              <Input
                type={credVisible[field.key] ? "text" : "password"}
                value={credValues[field.key] ?? ""}
                onChange={(e) => setCredValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setCredVisible((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
              >
                {credVisible[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveCredential(field.key)}
            disabled={credSaving === field.key || !credValues[field.key]?.trim()}
            className="mt-0.5"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {credSaving === field.key ? "..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Configure cost guardrails, generation limits, payment credentials, and other system parameters. Changes take effect immediately."
      />

      {/* AI Cost Guard Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">AI Provider Cost Guard</CardTitle>
          <p className="text-sm text-muted-foreground">
            Controls how much the platform spends on AI providers (OpenAI) per day.
            When spend hits a threshold, higher-cost tiers are automatically blocked to prevent overspending.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {CONFIG_DEFINITIONS.filter((c) => c.key.startsWith("cost_") || c.key === "daily_ai_budget_cents").map((cfg) => {
              const val = getValue(cfg.key, cfg.value);
              return (
                <div key={cfg.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{cfg.label}</label>
                  <p className="text-xs text-muted-foreground">{cfg.description}</p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        value={val}
                        onChange={(e) => setValue(cfg.key, Number(e.target.value))}
                        className="pr-12"
                      />
                      {cfg.suffix && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {cfg.suffix}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveConfig(cfg.key, val)}
                      disabled={saving === cfg.key}
                    >
                      <Save className="mr-1 h-3.5 w-3.5" />
                      {saving === cfg.key ? "..." : "Save"}
                    </Button>
                  </div>
                  {cfg.key === "daily_ai_budget_cents" && (
                    <p className="text-xs text-muted-foreground">= ${budgetDollars}/day</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
            <p className="font-medium text-blue-800 dark:text-blue-200">How Cost Guard Works</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
              <li><strong>Warning</strong> ({getValue("cost_warning_threshold_percent", 70)}%): Logs a warning. All tiers still active.</li>
              <li><strong>Critical</strong> ({getValue("cost_critical_threshold_percent", 90)}%): PREMIUM tier blocked. BASIC + STANDARD still active.</li>
              <li><strong>Emergency</strong> ({getValue("cost_emergency_threshold_percent", 100)}%): PREMIUM + STANDARD blocked. BASIC falls back to overlay rendering (no AI).</li>
              <li>Spend resets daily at midnight UTC. Tracked in Redis.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Generation Limits Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Generation Limits</CardTitle>
          <p className="text-sm text-muted-foreground">
            Controls how many generations each user can create per day. This prevents abuse and helps manage costs.
          </p>
        </CardHeader>
        <CardContent>
          {CONFIG_DEFINITIONS.filter((c) => c.key === "daily_generation_cap").map((cfg) => {
            const val = getValue(cfg.key, cfg.value);
            return (
              <div key={cfg.key} className="max-w-md space-y-1.5">
                <label className="text-sm font-medium">{cfg.label}</label>
                <p className="text-xs text-muted-foreground">{cfg.description}</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={val}
                    onChange={(e) => setValue(cfg.key, Number(e.target.value))}
                    className="max-w-[120px]"
                    min={1}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveConfig(cfg.key, val)}
                    disabled={saving === cfg.key}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {saving === cfg.key ? "..." : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Razorpay Credentials */}
      {credentials.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Razorpay Credentials
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Payment gateway credentials for web subscriptions. Values saved here override .env settings.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RAZORPAY_FIELDS.map(renderCredField)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Apple Subscription Credentials */}
      {credentials.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Apple className="h-4 w-4" />
              Apple Subscription Credentials
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              App Store Server API credentials for iOS subscription validation. Values saved here override .env settings.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {APPLE_FIELDS.map(renderCredField)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
