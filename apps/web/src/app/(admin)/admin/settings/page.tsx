"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "@/lib/admin-api";
import toast from "react-hot-toast";
import { PageHeader, LoadingState } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";

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

export default function AdminSettingsPage() {
  const [configs, setConfigs] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

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

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

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

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Configure cost guardrails, generation limits, and other system parameters. Changes take effect immediately."
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
      <Card>
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
    </div>
  );
}
