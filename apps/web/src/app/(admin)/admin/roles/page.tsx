"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { adminApi, type CustomRoleData } from "@/lib/admin-api";
import { PERMISSION_GROUPS } from "@ep/shared";

// ─── Toast helper ──────────────────────────────────────────

type ToastType = "success" | "error";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => dismiss(id), 3500);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return { toasts, show, dismiss };
}

// ─── Page ──────────────────────────────────────────────────

export default function RolesPage() {
  const { toasts, show: showToast, dismiss: dismissToast } = useToasts();

  const [roles, setRoles] = useState<CustomRoleData[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRoleData | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPermissions, setFormPermissions] = useState<Set<string>>(
    new Set()
  );

  // Collapsible groups
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CustomRoleData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Data fetching ─────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listRoles();
      setRoles(data);
    } catch {
      showToast("error", "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // ─── Dialog helpers ────────────────────────────────────

  function openCreateDialog() {
    setEditingRole(null);
    setFormName("");
    setFormDescription("");
    setFormPermissions(new Set());
    setExpandedGroups(new Set());
    setDialogOpen(true);
  }

  function openEditDialog(role: CustomRoleData) {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description ?? "");
    setFormPermissions(new Set(role.permissions));
    // Expand groups that have at least one permission checked
    const expanded = new Set<number>();
    PERMISSION_GROUPS.forEach((group, idx) => {
      if (group.permissions.some((p) => role.permissions.includes(p.code))) {
        expanded.add(idx);
      }
    });
    setExpandedGroups(expanded);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRole(null);
  }

  // ─── Permission toggles ───────────────────────────────

  function togglePermission(code: string) {
    setFormPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function toggleGroup(groupIdx: number) {
    const group = PERMISSION_GROUPS[groupIdx];
    const allChecked = group.permissions.every((p) =>
      formPermissions.has(p.code)
    );
    setFormPermissions((prev) => {
      const next = new Set(prev);
      group.permissions.forEach((p) => {
        if (allChecked) {
          next.delete(p.code);
        } else {
          next.add(p.code);
        }
      });
      return next;
    });
  }

  function toggleGroupExpanded(idx: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  // ─── Save ──────────────────────────────────────────────

  async function handleSave() {
    if (!formName.trim()) {
      showToast("error", "Role name is required");
      return;
    }
    if (formPermissions.size === 0) {
      showToast("error", "Select at least one permission");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        permissions: Array.from(formPermissions),
      };

      if (editingRole) {
        await adminApi.updateRole(editingRole.id, payload);
        showToast("success", `Role "${formName.trim()}" updated`);
      } else {
        await adminApi.createRole(payload);
        showToast("success", `Role "${formName.trim()}" created`);
      }

      closeDialog();
      fetchRoles();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        (editingRole ? "Failed to update role" : "Failed to create role");
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteRole(deleteTarget.id);
      showToast("success", `Role "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchRoles();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message || "Failed to delete role";
      showToast("error", msg);
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render helpers ────────────────────────────────────

  const totalPermissions = PERMISSION_GROUPS.reduce(
    (sum, g) => sum + g.permissions.length,
    0
  );

  return (
    <div className="relative">
      {/* ─── Toast container ────────────────────────────── */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            onClick={() => dismissToast(t.id)}
            className={`cursor-pointer rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
              t.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ─── Header ─────────────────────────────────────── */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Custom Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define granular permission-based roles for admin users
          </p>
        </div>
        <button
          onClick={openCreateDialog}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Create Role
        </button>
      </div>

      {/* ─── Roles list ─────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="ml-3 text-sm text-muted-foreground">
            Loading roles...
          </span>
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20">
          <svg
            className="h-10 w-10 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          <p className="mt-3 text-sm text-muted-foreground">
            No custom roles yet.
          </p>
          <button
            onClick={openCreateDialog}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Create Role
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="group relative rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Top row: name + system badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {role.name}
                    </h3>
                    {role.isSystem && (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        System
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                {!role.isSystem && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEditDialog(role)}
                      title="Edit role"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(role)}
                      title="Delete role"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                    />
                  </svg>
                  {role.permissions.length} permission
                  {role.permissions.length !== 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                    />
                  </svg>
                  {role._count?.users ?? 0} user
                  {(role._count?.users ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Permission preview pills */}
              {role.permissions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 4).map((perm) => (
                    <span
                      key={perm}
                      className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {perm}
                    </span>
                  ))}
                  {role.permissions.length > 4 && (
                    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      +{role.permissions.length - 4} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Dialog (modal) ───────────────── */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[5vh]">
          <div
            className="relative w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">
                {editingRole ? "Edit Role" : "Create Role"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {editingRole
                  ? "Update role name, description, and permissions."
                  : "Define a new role with granular permissions."}
              </p>
            </div>

            {/* Dialog body */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
              {/* Name */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Content Manager"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this role's purpose"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Permissions header */}
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Permissions
                </h3>
                <span className="text-xs text-muted-foreground">
                  {formPermissions.size} / {totalPermissions} selected
                </span>
              </div>

              {/* Permission groups */}
              <div className="space-y-2">
                {PERMISSION_GROUPS.map((group, groupIdx) => {
                  const isExpanded = expandedGroups.has(groupIdx);
                  const checkedCount = group.permissions.filter((p) =>
                    formPermissions.has(p.code)
                  ).length;
                  const allChecked =
                    checkedCount === group.permissions.length;
                  const someChecked = checkedCount > 0 && !allChecked;

                  return (
                    <div
                      key={groupIdx}
                      className="rounded-lg border border-border"
                    >
                      {/* Group header */}
                      <button
                        type="button"
                        onClick={() => toggleGroupExpanded(groupIdx)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <svg
                          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m19.5 8.25-7.5 7.5-7.5-7.5"
                          />
                        </svg>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {group.label}
                            </span>
                            {checkedCount > 0 && (
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                                {checkedCount}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {group.description}
                          </p>
                        </div>
                      </button>

                      {/* Group content */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          {/* Select all toggle */}
                          <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = someChecked;
                              }}
                              onChange={() => toggleGroup(groupIdx)}
                              className="h-4 w-4 rounded border-border text-primary accent-primary"
                            />
                            <span className="text-xs font-semibold text-foreground">
                              Select all
                            </span>
                          </label>

                          {/* Individual permissions */}
                          <div className="space-y-1 pl-2">
                            {group.permissions.map((perm) => (
                              <label
                                key={perm.code}
                                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={formPermissions.has(perm.code)}
                                  onChange={() => togglePermission(perm.code)}
                                  className="h-4 w-4 rounded border-border text-primary accent-primary"
                                />
                                <span className="text-sm text-foreground">
                                  {perm.label}
                                </span>
                                <code className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {perm.code}
                                </code>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dialog footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                )}
                {editingRole ? "Update Role" : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Dialog ─────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              {/* Warning icon */}
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <svg
                  className="h-6 w-6 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>

              <h2 className="text-center text-lg font-semibold text-foreground">
                Delete Role
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Are you sure you want to delete{" "}
                <strong className="text-foreground">
                  &ldquo;{deleteTarget.name}&rdquo;
                </strong>
                ?
              </p>

              {(deleteTarget._count?.users ?? 0) > 0 && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-xs font-medium text-amber-500">
                    Warning: This role is assigned to{" "}
                    {deleteTarget._count?.users} user
                    {(deleteTarget._count?.users ?? 0) !== 1 ? "s" : ""}. They
                    will lose these permissions immediately.
                  </p>
                </div>
              )}

              <p className="mt-3 text-center text-xs text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
