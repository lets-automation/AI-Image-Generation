"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/admin-api";
import { PageHeader, DataTable, DataTablePagination, LoadingState, type ColumnDef } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function actionBadgeVariant(action: string): "destructive" | "default" | "warning" | "secondary" {
  if (action.startsWith("moderation")) return "destructive";
  if (action.startsWith("subscription")) return "warning";
  if (action.startsWith("admin")) return "default";
  return "secondary";
}

export default function ModerationPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity", entityFilter);

      const response = await adminApi.listAuditLogs(params.toString());
      const result = response as unknown as { data: AuditLogEntry[]; meta: PaginationMeta } | AuditLogEntry[];

      if (Array.isArray(result)) {
        setLogs(result);
        setMeta(null);
      } else if (result && typeof result === "object" && "data" in result) {
        setLogs(result.data ?? []);
        setMeta(result.meta ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, entityFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const hasFilters = actionFilter || entityFilter;

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: "time",
      header: "Time",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => (
        <Badge variant={actionBadgeVariant(row.action)}>
          {row.action}
        </Badge>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => <span className="text-sm">{row.entity}</span>,
    },
    {
      key: "userId",
      header: "User",
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.userId ? row.userId.slice(0, 12) + "..." : "--"}
        </span>
      ),
    },
    {
      key: "details",
      header: "Details",
      cell: (row) => (
        <span className="max-w-xs truncate text-xs text-muted-foreground">
          {row.changes ? JSON.stringify(row.changes).slice(0, 80) : "--"}
        </span>
      ),
    },
    {
      key: "ip",
      header: "IP",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.ipAddress ?? "--"}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Moderation & Audit Logs"
        description="Review system events, moderation blocks, and admin actions"
      />

      {/* Filters */}
      <div className="mb-6 flex items-center gap-3">
        <Select value={actionFilter || "all"} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="moderation">Moderation Blocks</SelectItem>
            <SelectItem value="admin">Admin Actions</SelectItem>
            <SelectItem value="generation">Generations</SelectItem>
            <SelectItem value="subscription">Subscription</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter || "all"} onValueChange={(v) => { setEntityFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="Prompt">Prompt</SelectItem>
            <SelectItem value="Generation">Generation</SelectItem>
            <SelectItem value="Template">Template</SelectItem>
            <SelectItem value="Category">Category</SelectItem>
            <SelectItem value="Transaction">Transaction</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setActionFilter(""); setEntityFilter(""); setPage(1); }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable columns={columns} data={logs} rowKey={(r) => r.id} emptyMessage="No audit logs found." />
          {meta && meta.totalPages > 1 && (
            <DataTablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={setPage}
              pageSize={25}
            />
          )}
        </>
      )}
    </div>
  );
}
