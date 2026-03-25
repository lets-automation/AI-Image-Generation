"use client";

import { useEffect, useState, useCallback } from "react";
import { useSubscriptionStore } from "@/stores/subscription.store";
import toast from "react-hot-toast";
import Script from "next/script";
import { useRequireAuth } from "@/hooks/useAuth";

// Razorpay type declaration
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    BILLING_RETRY: "bg-yellow-100 text-yellow-800",
    GRACE_PERIOD: "bg-orange-100 text-orange-800",
    EXPIRED: "bg-red-100 text-red-800",
    REVOKED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}

export default function SubscriptionPage() {
  const { isReady } = useRequireAuth();
  const {
    status,
    plans,
    isLoading,
    error,
    fetchStatus,
    fetchPlans,
    createRazorpayOrder,
    verifyRazorpayPayment,
    cancelSubscription,
  } = useSubscriptionStore();

  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchPlans();
  }, [fetchStatus, fetchPlans]);

  const handlePurchase = useCallback(
    async (planId: string) => {
      if (!razorpayLoaded || !window.Razorpay) {
        toast.error("Payment system is loading. Please try again in a moment.");
        return;
      }

      setPurchasingPlanId(planId);

      try {
        // 1. Create Razorpay order via our backend
        const order = await createRazorpayOrder(planId);

        // 2. Open Razorpay checkout
        const options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "EP-Product",
          description: `${order.planName} - Weekly Subscription`,
          order_id: order.orderId,
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            // 3. Verify payment on backend
            try {
              await verifyRazorpayPayment(planId, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              toast.success("Subscription activated! 🎉");
              fetchStatus(); // Refresh status
            } catch (verifyErr) {
              const msg =
                verifyErr instanceof Error ? verifyErr.message : "Payment verification failed";
              toast.error(msg);
            } finally {
              setPurchasingPlanId(null);
            }
          },
          prefill: {},
          theme: {
            color: "#6366f1",
          },
          modal: {
            ondismiss: () => {
              setPurchasingPlanId(null);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", () => {
          toast.error("Payment failed. Please try again.");
          setPurchasingPlanId(null);
        });
        rzp.open();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to initiate payment";
        toast.error(msg);
        setPurchasingPlanId(null);
      }
    },
    [razorpayLoaded, createRazorpayOrder, verifyRazorpayPayment, fetchStatus]
  );

  if (isLoading && !status) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Subscription</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-40 rounded-lg bg-gray-200" />
          <div className="h-32 rounded-lg bg-gray-200" />
        </div>
      </div>
    );
  }

  const sub = status?.subscription;
  const balance = status?.balance;
  const hasActive = status?.hasActiveSubscription;

  return (
    <>
      {/* Load Razorpay SDK */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
        strategy="lazyOnload"
      />

      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Subscription</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Current Plan Card */}
        {hasActive && sub ? (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{sub.planName}</h2>
                <p className="text-sm text-gray-500">via {sub.provider}</p>
              </div>
              <StatusBadge status={sub.status} />
            </div>

            {/* Credits */}
            {balance && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-500">Credits remaining</span>
                  <span className="text-2xl font-bold text-primary-700">
                    {balance.remainingCredits}
                    <span className="text-sm font-normal text-gray-400">
                      {" "}
                      / {balance.weeklyCredits}
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (balance.remainingCredits / balance.weeklyCredits) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Period Info */}
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Period start</span>
                <p className="font-medium text-gray-900">
                  {new Date(sub.currentPeriodStart).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">
                  {sub.autoRenewEnabled ? "Renews on" : "Expires on"}
                </span>
                <p className="font-medium text-gray-900">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Auto-renew status + Cancel */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm">
                {sub.autoRenewEnabled ? (
                  <p className="text-green-600">Auto-renewal is enabled</p>
                ) : (
                  <p className="text-orange-600">
                    Subscription will expire on {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    {sub.cancellationReason && ` — ${sub.cancellationReason}`}
                  </p>
                )}
              </div>
              {sub.autoRenewEnabled && (
                <div>
                  {!showCancelConfirm ? (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
                    >
                      Cancel subscription
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Are you sure?</span>
                      <button
                        onClick={async () => {
                          setCancelling(true);
                          try {
                            await cancelSubscription();
                            toast.success("Subscription cancelled. You can use credits until the period ends.");
                          } catch {
                            toast.error("Failed to cancel subscription");
                          } finally {
                            setCancelling(false);
                            setShowCancelConfirm(false);
                          }
                        }}
                        disabled={cancelling}
                        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {cancelling ? "Cancelling..." : "Yes, cancel"}
                      </button>
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        No, keep
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tier Access */}
            <div className="mt-4">
              <span className="text-sm text-gray-500">Tiers included</span>
              <div className="mt-1 flex gap-2">
                {sub.tierAccess.map((tier) => (
                  <span
                    key={tier}
                    className="rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700"
                  >
                    {tier}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">No active subscription</h2>
            <p className="mt-2 text-sm text-gray-500">
              Subscribe to a plan below to start generating creatives.
            </p>
          </div>
        )}

        {/* Available Plans */}
        {plans.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Available Plans</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = sub?.planId === plan.id;
                const isPurchasing = purchasingPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg ${
                      isCurrent
                        ? "border-primary-300 bg-primary-50/30 shadow-md ring-1 ring-primary-300"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute right-0 top-0 rounded-bl-xl bg-primary-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
                        CURRENT PLAN
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-gray-900">
                      {plan.name}
                    </h3>
                    <p className="mt-2 text-3xl font-extrabold text-gray-900">
                      {"\u20B9"}
                      {(plan.priceInr / 100).toFixed(0)}
                      <span className="text-sm font-medium text-gray-500">/week</span>
                    </p>
                    <p className="mt-2 text-sm font-medium text-gray-500">
                      {plan.weeklyCredits} credits per week
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {plan.tierAccess.map((tier) => (
                        <span
                          key={tier}
                          className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600"
                        >
                          {tier}
                        </span>
                      ))}
                    </div>
                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {plan.features.map((f, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-1.5 text-xs text-gray-600"
                          >
                            <svg
                              className="h-3.5 w-3.5 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Purchase button */}
                    <div className="mt-auto pt-6">
                      {!isCurrent && (
                        <button
                          onClick={() => handlePurchase(plan.id)}
                          disabled={isPurchasing || isLoading || !!hasActive}
                          className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md ${
                            isPurchasing || isLoading || hasActive
                              ? "cursor-not-allowed bg-gray-300 text-gray-500 shadow-none hover:shadow-none"
                              : "bg-primary-600 hover:bg-primary-700 active:scale-[0.98]"
                          }`}
                        >
                          {isPurchasing
                            ? "Processing..."
                            : hasActive
                            ? "Already Subscribed"
                            : "Subscribe Now"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
