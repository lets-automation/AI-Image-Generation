"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/admin/form-dialog";
import { FormField } from "@/components/admin/form-field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/utils";
import { adminApi, type UserData, type CustomRoleData } from "@/lib/admin-api";
import { useAuthStore } from "@/stores/auth.store";
import {
  Plus,
  Search,
  MoreHorizontal,
  ShieldCheck,
  ShieldAlert,
  Shield,
  UserX,
  UserCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

type RoleFilter = string;

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  },
  ADMIN: {
    label: "Admin",
    className: "border-blue-500/25 bg-blue-500/10 text-blue-400",
  },
  USER: {
    label: "User",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export default function UsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  // Create admin dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    role: "ADMIN",
  });

  // Role change confirm
  const [roleConfirm, setRoleConfirm] = useState<{
    user: UserData;
    newRole: string;
  } | null>(null);

  // Toggle active confirm
  const [toggleConfirm, setToggleConfirm] = useState<UserData | null>(null);

  // Toggle generation access confirm
  const [toggleGenConfirm, setToggleGenConfirm] = useState<UserData | null>(null);

  // Custom roles for assignment
  const [customRoles, setCustomRoles] = useState<CustomRoleData[]>([]);
  const [assignRoleConfirm, setAssignRoleConfirm] = useState<{
    user: UserData;
    customRole: CustomRoleData;
    isRemoving: boolean;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (search.trim()) params.set("search", search.trim());
      const result = await adminApi.listUsers(params.toString());
      setUsers(result.data);
      setMeta({ total: result.meta.total, totalPages: result.meta.totalPages });
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Fetch custom roles (for the assign dropdown)
  useEffect(() => {
    if (isSuperAdmin) {
      adminApi.listRoles().then(setCustomRoles).catch(() => {});
    }
  }, [isSuperAdmin]);

  const handleCreateAdmin = async () => {
    setCreateLoading(true);
    try {
      await adminApi.createAdmin({
        email: newAdmin.email,
        password: newAdmin.password,
        name: newAdmin.name,
        phone: newAdmin.phone || undefined,
        role: newAdmin.role,
      });
      toast.success("Admin account created");
      setCreateOpen(false);
      setNewAdmin({ email: "", password: "", name: "", phone: "", role: "ADMIN" });
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to create admin");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleConfirm) return;
    try {
      await adminApi.updateUserRole(roleConfirm.user.id, roleConfirm.newRole);
      toast.success(`Role updated to ${ROLE_CONFIG[roleConfirm.newRole]?.label}`);
      setRoleConfirm(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to update role");
    }
  };

  const handleToggleActive = async () => {
    if (!toggleConfirm) return;
    try {
      await adminApi.toggleUserActive(toggleConfirm.id);
      toast.success(
        toggleConfirm.isActive ? "User deactivated" : "User reactivated"
      );
      setToggleConfirm(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to update user");
    }
  };

  const handleToggleGenAccess = async () => {
    if (!toggleGenConfirm) return;
    try {
      await adminApi.toggleGenerationAccess(toggleGenConfirm.id);
      toast.success(
        toggleGenConfirm.canGenerate ? "Generation access revoked" : "Generation access granted"
      );
      setToggleGenConfirm(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to update generation access");
    }
  };

  const handleAssignCustomRole = async () => {
    if (!assignRoleConfirm) return;
    try {
      await adminApi.assignCustomRole(
        assignRoleConfirm.user.id,
        assignRoleConfirm.isRemoving ? null : assignRoleConfirm.customRole.id
      );
      toast.success(assignRoleConfirm.isRemoving ? "Custom role removed" : "Custom role assigned");
      setAssignRoleConfirm(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to assign role");
    }
  };

  return (
    <>
      <PageHeader
        title="User Management"
        description="Manage user accounts, roles, and permissions"
        actions={
          isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push("/admin/roles")}>
                <Shield className="mr-2 h-4 w-4" />
                Create Role
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Admin
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v as RoleFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Roles</SelectItem>
            <SelectItem value="USER">Users</SelectItem>
            <SelectItem value="ADMIN">Admins</SelectItem>
            <SelectItem value="SUPER_ADMIN">Super Admins</SelectItem>
            {customRoles.length > 0 && (
              <>
                <SelectSeparator />
                {customRoles.map((cr) => (
                  <SelectItem key={cr.id} value={cr.id}>
                    {cr.name} (Custom)
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Custom Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gen. Access</TableHead>
              <TableHead className="text-right">Total Gens</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-muted-foreground"
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const roleConfig = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.USER;
                const isCurrentUser = u.id === currentUser?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-medium", roleConfig.className)}
                      >
                        {roleConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.customRoleId ? (
                        <Badge
                          variant="outline"
                          className="border-violet-500/25 bg-violet-500/10 text-violet-400 font-medium"
                        >
                          {customRoles.find((r) => r.id === u.customRoleId)?.name ?? "Custom"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          u.isActive
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                            : "border-destructive/25 bg-destructive/10 text-destructive"
                        )}
                      >
                        {u.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          u.canGenerate || u.role === "SUPER_ADMIN"
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                            : "border-muted bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {u.canGenerate || u.role === "SUPER_ADMIN" ? "Allowed" : "Denied"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u._count?.generations ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {!isCurrentUser && (
                        /* Hide ALL actions from non-Super Admins viewing Super Admin rows */
                        (u.role === "SUPER_ADMIN" && !isSuperAdmin) ? null : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Role change options — SUPER_ADMIN only */}
                            {isSuperAdmin && u.role !== "ADMIN" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleConfirm({ user: u, newRole: "ADMIN" })
                                }
                              >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && u.role !== "USER" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleConfirm({ user: u, newRole: "USER" })
                                }
                              >
                                <ShieldAlert className="mr-2 h-4 w-4" />
                                Demote to User
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              onClick={() => setToggleConfirm(u)}
                              className={
                                u.isActive ? "text-destructive" : "text-emerald-400"
                              }
                            >
                              {u.isActive ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Reactivate
                                </>
                              )}
                            </DropdownMenuItem>
                            {isSuperAdmin && (
                              <DropdownMenuItem
                                onClick={() => setToggleGenConfirm(u)}
                              >
                                {u.canGenerate ? (
                                  <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    Revoke Gen. Access
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Allow Gen. Access
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && customRoles.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {customRoles.map((role) => {
                                  const isAssigned = u.customRoleId === role.id;
                                  return (
                                    <DropdownMenuItem
                                      key={role.id}
                                      onClick={() => setAssignRoleConfirm({
                                        user: u,
                                        customRole: role,
                                        isRemoving: isAssigned
                                      })}
                                    >
                                      <Shield className="mr-2 h-4 w-4" />
                                      {isAssigned ? `Remove "${role.name}"` : `Assign "${role.name}"`}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Custom Role Assign Confirm */}
      <ConfirmDialog
        open={!!assignRoleConfirm}
        onOpenChange={() => setAssignRoleConfirm(null)}
        title={assignRoleConfirm?.isRemoving ? "Remove Custom Role" : "Assign Custom Role"}
        description={
          assignRoleConfirm
            ? assignRoleConfirm.isRemoving
              ? `Remove the "${assignRoleConfirm.customRole.name}" role from ${assignRoleConfirm.user.name}? They will lose its associated permissions.`
              : `Assign the "${assignRoleConfirm.customRole.name}" role to ${assignRoleConfirm.user.name}? This takes effect immediately.`
            : ""
        }
        onConfirm={handleAssignCustomRole}
        confirmLabel={assignRoleConfirm?.isRemoving ? "Remove Role" : "Assign Role"}
        variant={assignRoleConfirm?.isRemoving ? "destructive" : "default"}
      />

      {/* Role Change Confirm */}
      <ConfirmDialog
        open={!!roleConfirm}
        onOpenChange={() => setRoleConfirm(null)}
        title="Change User Role"
        description={
          roleConfirm
            ? `Change ${roleConfirm.user.name}'s role from ${ROLE_CONFIG[roleConfirm.user.role]?.label} to ${ROLE_CONFIG[roleConfirm.newRole]?.label}? This takes effect immediately.`
            : ""
        }
        onConfirm={handleRoleChange}
        confirmLabel="Change Role"
      />

      {/* Toggle Active Confirm */}
      <ConfirmDialog
        open={!!toggleConfirm}
        onOpenChange={() => setToggleConfirm(null)}
        title={toggleConfirm?.isActive ? "Deactivate User" : "Reactivate User"}
        description={
          toggleConfirm
            ? toggleConfirm.isActive
              ? `Deactivate ${toggleConfirm.name}? They will be unable to log in.`
              : `Reactivate ${toggleConfirm.name}? They will be able to log in again.`
            : ""
        }
        onConfirm={handleToggleActive}
        confirmLabel={toggleConfirm?.isActive ? "Deactivate" : "Reactivate"}
        variant={toggleConfirm?.isActive ? "destructive" : "default"}
      />

      {/* Toggle Generation Access Confirm */}
      <ConfirmDialog
        open={!!toggleGenConfirm}
        onOpenChange={() => setToggleGenConfirm(null)}
        title={toggleGenConfirm?.canGenerate ? "Revoke Generation Access" : "Grant Generation Access"}
        description={
          toggleGenConfirm
            ? toggleGenConfirm.canGenerate
              ? `Revoke generation access for ${toggleGenConfirm.name}? They will no longer be able to generate images.`
              : `Grant generation access to ${toggleGenConfirm.name}? They will be able to generate template images.`
            : ""
        }
        onConfirm={handleToggleGenAccess}
        confirmLabel={toggleGenConfirm?.canGenerate ? "Revoke Access" : "Grant Access"}
        variant={toggleGenConfirm?.canGenerate ? "destructive" : "default"}
      />

      {/* Create Admin Dialog */}
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Admin Account"
        description="Create a new administrator account. The user will log in with these credentials."
        onSubmit={handleCreateAdmin}
        submitLabel="Create Account"
        loading={createLoading}
      >
        <FormField label="Full Name" required>
          <Input
            value={newAdmin.name}
            onChange={(e) =>
              setNewAdmin((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="John Doe"
          />
        </FormField>
        <FormField label="Email" required>
          <Input
            type="email"
            value={newAdmin.email}
            onChange={(e) =>
              setNewAdmin((p) => ({ ...p, email: e.target.value }))
            }
            placeholder="admin@example.com"
          />
        </FormField>
        <FormField label="Password" required description="Minimum 8 characters">
          <Input
            type="password"
            value={newAdmin.password}
            onChange={(e) =>
              setNewAdmin((p) => ({ ...p, password: e.target.value }))
            }
            placeholder="Min 8 characters"
          />
        </FormField>
        <FormField label="Phone">
          <Input
            value={newAdmin.phone}
            onChange={(e) =>
              setNewAdmin((p) => ({ ...p, phone: e.target.value }))
            }
            placeholder="+91..."
          />
        </FormField>
        <FormField label="Role" required>
          <Select
            value={newAdmin.role}
            onValueChange={(v) => setNewAdmin((p) => ({ ...p, role: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </FormDialog>
    </>
  );
}
