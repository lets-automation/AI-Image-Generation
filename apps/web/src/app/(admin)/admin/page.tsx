"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import { PageHeader, StatCard, DataTable, LoadingState, type ColumnDef } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Zap, Image, FolderTree, CreditCard, Clock,
  ArrowRight, AlertTriangle,
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

interface TopTemplate {
  id: string;
  name: string;
  usageCount: number;
  contentType: string;
  category: { name: string };
}

interface RecentFailure {
  id: string;
  qualityTier: string;
  errorMessage: string | null;
  createdAt: string;
  user: { id: string; name: string | null };
}

const templateColumns: ColumnDef<TopTemplate>[] = [
  {
    key: "name",
    header: "Template",
    cell: (row) => (
      <div>
        <p className="font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.category.name}</p>
      </div>
    ),
  },
  {
    key: "contentType",
    header: "Type",
    cell: (row) => <Badge variant="outline">{row.contentType}</Badge>,
  },
  {
    key: "usage",
    header: "Uses",
    className: "text-right",
    cell: (row) => <span className="font-medium">{row.usageCount}</span>,
  },
];

const failureColumns: ColumnDef<RecentFailure>[] = [
  {
    key: "tier",
    header: "Tier",
    cell: (row) => <Badge variant="destructive">{row.qualityTier}</Badge>,
  },
  {
    key: "error",
    header: "Error",
    cell: (row) => (
      <p className="max-w-xs truncate text-xs text-muted-foreground">
        {row.errorMessage ?? "Unknown error"}
      </p>
    ),
  },
  {
    key: "time",
    header: "Time",
    cell: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleString()}
      </span>
    ),
  },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topTemplates, setTopTemplates] = useState<TopTemplate[]>([]);
  const [recentFailures, setRecentFailures] = useState<RecentFailure[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [statsRes, templatesRes, failuresRes] = await Promise.all([
          apiClient.get("/admin/analytics/dashboard"),
          apiClient.get("/admin/analytics/top-templates?limit=5"),
          apiClient.get("/admin/analytics/failures?limit=5"),
        ]);
        setStats(statsRes.data.data as DashboardStats);
        setTopTemplates(templatesRes.data.data as TopTemplate[]);
        setRecentFailures(failuresRes.data.data as RecentFailure[]);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (isLoading) return <LoadingState />;

  const s = stats ?? {
    totalUsers: 0, generationsToday: 0, generationsTotal: 0,
    creditsUsedToday: 0, creditsUsedTotal: 0, activeTemplates: 0,
    totalCategories: 0, pendingJobs: 0, activeSubscriptions: 0,
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Platform overview and key metrics"
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/analytics">
              Full Analytics
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Templates</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DataTable
              columns={templateColumns}
              data={topTemplates}
              emptyMessage="No templates yet."
              rowKey={(r) => r.id}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Recent Failures
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DataTable
              columns={failureColumns}
              data={recentFailures}
              emptyMessage="No failures. All systems operational."
              rowKey={(r) => r.id}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
