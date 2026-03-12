"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { PageHeader, StatCard, DataTable, LoadingState, type ColumnDef } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users, Zap, Image, FolderTree, CreditCard, Clock,
  DollarSign, AlertTriangle, CheckCircle2, HelpCircle,
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  generationsToday: number;
  generationsTotal: number;
  creditsUsedToday: number;
  creditsUsedTotal: number;
  activeTemplates: number;
  totalCategories: number;
  pendingJobs: number;
  activeSubscriptions: number;
}

interface CostMetrics {
  dailySpend: number;
  warningThreshold: number;
  criticalThreshold: number;
  emergencyThreshold: number;
  tier2Enabled: boolean;
  tier3Enabled: boolean;
}

interface GenerationTrend {
  date: string;
  tier: string;
  count: number;
}

interface TrendRow {
  date: string;
  basic: number;
  standard: number;
  premium: number;
  total: number;
}

const trendColumns: ColumnDef<TrendRow>[] = [
  { key: "date", header: "Date", cell: (row) => <span className="font-medium">{row.date}</span> },
  { key: "basic", header: "Basic", cell: (row) => <span>{row.basic}</span> },
  { key: "standard", header: "Standard", cell: (row) => <span>{row.standard}</span> },
  { key: "premium", header: "Premium", cell: (row) => <span>{row.premium}</span> },
  { key: "total", header: "Total", cell: (row) => <span className="font-semibold">{row.total}</span> },
];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [costs, setCosts] = useState<CostMetrics | null>(null);
  const [trends, setTrends] = useState<GenerationTrend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, costsRes, trendsRes] = await Promise.all([
          apiClient.get("/admin/analytics/dashboard"),
          apiClient.get("/admin/analytics/costs"),
          apiClient.get("/admin/analytics/trends?days=14"),
        ]);
        setStats(statsRes.data.data as DashboardStats);
        setCosts(costsRes.data.data as CostMetrics);
        setTrends(trendsRes.data.data as GenerationTrend[]);
      } catch (err) {
        console.error("Failed to load analytics:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (isLoading) return <LoadingState />;

  const s = stats ?? {
    totalUsers: 0, generationsToday: 0, generationsTotal: 0,
    creditsUsedToday: 0, creditsUsedTotal: 0, activeTemplates: 0,
    totalCategories: 0, pendingJobs: 0, activeSubscriptions: 0,
  };

  const c = costs ?? {
    dailySpend: 0, warningThreshold: 50, criticalThreshold: 65,
    emergencyThreshold: 72, tier2Enabled: true, tier3Enabled: true,
  };

  const spendPercent = c.emergencyThreshold > 0
    ? Math.min(100, Math.round((c.dailySpend / c.emergencyThreshold) * 100))
    : 0;

  const trendsByDate = trends.reduce<Record<string, Record<string, number>>>((acc, t) => {
    if (!acc[t.date]) acc[t.date] = {};
    acc[t.date][t.tier] = t.count;
    return acc;
  }, {});

  const trendRows: TrendRow[] = Object.entries(trendsByDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, tiers]) => ({
      date,
      basic: tiers.BASIC ?? 0,
      standard: tiers.STANDARD ?? 0,
      premium: tiers.PREMIUM ?? 0,
      total: (tiers.BASIC ?? 0) + (tiers.STANDARD ?? 0) + (tiers.PREMIUM ?? 0),
    }));

  return (
    <div>
      <PageHeader
        title="Analytics & Monitoring"
        description="Platform metrics, AI costs, and generation trends"
      />

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={s.totalUsers.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Generations Today" value={s.generationsToday.toLocaleString()} icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Total Generations" value={s.generationsTotal.toLocaleString()} icon={<Image className="h-4 w-4" />} />
        <StatCard label="Active Templates" value={s.activeTemplates.toLocaleString()} icon={<Image className="h-4 w-4" />} />
        <StatCard label="Credits Used Today" value={s.creditsUsedToday.toLocaleString()} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard label="Active Subscriptions" value={s.activeSubscriptions.toLocaleString()} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard label="Categories" value={s.totalCategories.toLocaleString()} icon={<FolderTree className="h-4 w-4" />} />
        <StatCard
          label="Pending Jobs"
          value={s.pendingJobs.toLocaleString()}
          icon={<Clock className="h-4 w-4" />}
          variant={s.pendingJobs > 0 ? "warning" : "default"}
        />
      </div>

      {/* AI Cost Monitor */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            AI Provider Cost Monitor
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground/40 transition-colors hover:text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[320px] text-xs leading-relaxed">
                  Tracks real-time spending across AI providers. When daily spend approaches thresholds, higher-cost tiers are progressively disabled to prevent budget overruns.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-5 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Daily Spend</p>
                <p className="mt-1 text-2xl font-bold">${c.dailySpend.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Limit</p>
                <p className="mt-1 text-2xl font-bold text-muted-foreground">${c.emergencyThreshold.toFixed(2)}</p>
              </div>
            </div>
            <Progress
              value={spendPercent}
              className={`mt-4 h-2.5 ${spendPercent >= 90 ? "[&>div]:bg-destructive" : spendPercent >= 70 ? "[&>div]:bg-amber-500" : ""}`}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{spendPercent}% of daily budget</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />70% warn</span>
                <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />90% restrict</span>
                <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />100% fallback</span>
              </div>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tier Status
            </p>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/40 transition-colors hover:text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px] text-xs leading-relaxed">
                  Each tier uses different AI providers at different price points. As daily spend increases, the system restricts higher-cost tiers first (Premium at 90%, all at 100%).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Basic", enabled: spendPercent < 100, threshold: "100%" },
              { label: "Standard", enabled: c.tier2Enabled, threshold: `$${c.emergencyThreshold.toFixed(0)}` },
              { label: "Premium", enabled: c.tier3Enabled, threshold: `$${c.criticalThreshold.toFixed(0)}` },
            ].map((tier) => (
              <div key={tier.label} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {tier.enabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">{tier.label}</span>
                </div>
                {tier.enabled ? (
                  <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-xs">Active</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Blocked at {tier.threshold}</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Generation Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation Trends (14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={trendColumns}
            data={trendRows}
            emptyMessage="No generation data yet."
            rowKey={(r) => r.date}
          />
        </CardContent>
      </Card>
    </div>
  );
}
