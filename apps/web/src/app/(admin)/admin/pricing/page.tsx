"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader, FormDialog, FormField, ConfirmDialog, StatusBadge, LoadingState } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminApi, type SubscriptionPlanData } from "@/lib/admin-api";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlanData[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [appleProductId, setAppleProductId] = useState("");
  const [weeklyCredits, setWeeklyCredits] = useState(10);
  const [priceRupees, setPriceRupees] = useState(99);
  const [tierAccess, setTierAccess] = useState<string[]>(["BASIC"]);
  const [sortOrder, setSortOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadPlans = useCallback(async () => {
    try {
      const data = await adminApi.listSubscriptionPlans();
      setPlans(data);
    } catch {
      toast.error("Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function resetForm() {
    setName("");
    setAppleProductId("");
    setWeeklyCredits(10);
    setPriceRupees(99);
    setTierAccess(["BASIC"]);
    setSortOrder(0);
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(plan: SubscriptionPlanData) {
    setEditing(plan.id);
    setName(plan.name);
    setAppleProductId(plan.appleProductId);
    setWeeklyCredits(plan.weeklyCredits);
    setPriceRupees(Math.round(plan.priceInr / 100));
    setTierAccess(plan.tierAccess);
    setSortOrder(plan.sortOrder);
    setShowForm(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const body = {
      name,
      appleProductId,
      weeklyCredits,
      priceInr: Math.round(priceRupees * 100),
      tierAccess,
      sortOrder,
    };

    try {
      if (editing) {
        await adminApi.updateSubscriptionPlan(editing, body);
        toast.success("Plan updated");
      } else {
        await adminApi.createSubscriptionPlan(body);
        toast.success("Plan created");
      }
      resetForm();
      await loadPlans();
    } catch {
      toast.error("Failed to save plan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteSubscriptionPlan(deleteTarget);
      toast.success("Plan deleted");
      setDeleteTarget(null);
      await loadPlans();
    } catch {
      toast.error("Failed to delete plan");
    }
  }

  function toggleTier(tier: string) {
    setTierAccess((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Subscription Plans" description="Manage Apple Auto-Renewable Subscription plans" />
        <LoadingState message="Loading subscription plans..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        description="Manage Apple Auto-Renewable Subscription plans"
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Plan
          </Button>
        }
      />

      {/* Plan Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={cn("transition-opacity", !plan.isActive && "opacity-50")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge active={plan.isActive} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEdit(plan)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget(plan.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Apple Product ID
                  </p>
                  <code className="mt-0.5 block text-xs text-foreground/80">
                    {plan.appleProductId}
                  </code>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Weekly Credits
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">{plan.weeklyCredits}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Price
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {"\u20B9"}{(plan.priceInr / 100).toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subscribers
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {plan._count?.subscriptions ?? 0}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tier Access
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.tierAccess.map((tier) => (
                    <Badge key={tier} variant="secondary" className="text-xs font-medium">
                      {tier}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {plans.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-sm text-muted-foreground">No subscription plans configured.</p>
          <Button className="mt-4" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Create First Plan
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <FormDialog
        open={showForm}
        onOpenChange={(open) => { if (!open) resetForm(); }}
        title={editing ? "Edit Subscription Plan" : "New Subscription Plan"}
        description={editing
          ? "Update the plan details below. Changes will apply to new subscribers."
          : "Configure a new Apple Auto-Renewable Subscription plan."
        }
        onSubmit={handleSubmit}
        submitLabel={editing ? "Update Plan" : "Create Plan"}
        loading={submitting}
        maxWidth="sm:max-w-[540px]"
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Plan Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starter, Pro, Business"
              required
            />
          </FormField>
          <FormField label="Apple Product ID" required description="The identifier from App Store Connect">
            <Input
              value={appleProductId}
              onChange={(e) => setAppleProductId(e.target.value)}
              placeholder="com.example.starter.weekly"
              required
            />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Weekly Credits" required description="Number of credits the subscriber receives each week. Resets every billing cycle.">
            <Input
              type="number"
              value={weeklyCredits}
              onChange={(e) => setWeeklyCredits(Number(e.target.value))}
              min={1}
              placeholder="e.g. 10"
              required
            />
          </FormField>
          <FormField label="Price (₹)" required description="Enter price in rupees. Example: 99, 299, 499.">
            <Input
              type="number"
              value={priceRupees}
              onChange={(e) => setPriceRupees(Number(e.target.value))}
              min={1}
              placeholder="e.g. 99"
              required
            />
          </FormField>
          <FormField label="Sort Order" description="Lower number = shown first">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </FormField>
        </div>
        <FormField label="Tier Access" description="Select which quality tiers this plan grants access to">
          <div className="flex gap-2">
            {TIERS.map((tier) => (
              <Button
                key={tier}
                type="button"
                variant={tierAccess.includes(tier) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTier(tier)}
                className="text-xs"
              >
                {tier}
              </Button>
            ))}
          </div>
        </FormField>
      </FormDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Subscription Plan"
        description="This action cannot be undone. The plan will be permanently removed. Existing subscribers will not be affected until their current billing cycle ends."
        onConfirm={handleDelete}
        confirmLabel="Delete Plan"
        variant="destructive"
      />
    </div>
  );
}
