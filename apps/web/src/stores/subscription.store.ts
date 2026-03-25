"use client";

import { create } from "zustand";
import { apiClient } from "@/lib/api-client";

// ─── Types ──────────────────────────────────────────────

interface SubscriptionPlan {
  id: string;
  name: string;
  appleProductId: string;
  priceInr: number;
  weeklyCredits: number;
  tierAccess: string[];
  features: string[] | null;
  sortOrder: number;
}

interface SubscriptionInfo {
  id: string;
  planId: string;
  planName: string;
  tierAccess: string[];
  status: string;
  provider: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenewEnabled: boolean;
  cancellationReason: string | null;
}

interface BalanceInfo {
  remainingCredits: number;
  weeklyCredits: number;
  periodEnd: string;
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription: SubscriptionInfo | null;
  balance: BalanceInfo | null;
}

interface RazorpayOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  planId: string;
  planName: string;
  keyId: string;
}

interface SubscriptionState {
  status: SubscriptionStatus | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  verifyPurchase: (signedTransactionInfo: string) => Promise<void>;
  restorePurchase: (originalTransactionId: string) => Promise<void>;
  createRazorpayOrder: (planId: string) => Promise<RazorpayOrderResult>;
  verifyRazorpayPayment: (planId: string, payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  reset: () => void;
}

// ─── Store ──────────────────────────────────────────────

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  status: null,
  plans: [],
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get<{ success: boolean; data: SubscriptionStatus }>(
        "/subscriptions/status"
      );
      set({ status: res.data.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? "Failed to fetch subscription status", isLoading: false });
    }
  },

  fetchPlans: async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: SubscriptionPlan[] }>(
        "/subscriptions/plans"
      );
      set({ plans: res.data.data });
    } catch {
      // Non-critical — plans can be fetched later
    }
  },

  verifyPurchase: async (signedTransactionInfo: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<{ success: boolean; data: SubscriptionStatus }>(
        "/subscriptions/verify",
        { signedTransactionInfo }
      );
      set({ status: res.data.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? "Purchase verification failed", isLoading: false });
      throw err;
    }
  },

  restorePurchase: async (originalTransactionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<{ success: boolean; data: SubscriptionStatus }>(
        "/subscriptions/restore",
        { originalTransactionId }
      );
      set({ status: res.data.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message ?? "Restore failed", isLoading: false });
      throw err;
    }
  },

  createRazorpayOrder: async (planId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<{ success: boolean; data: RazorpayOrderResult }>(
        "/subscriptions/razorpay/create-order",
        { planId }
      );
      set({ isLoading: false });
      return res.data.data;
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? err.message ?? "Failed to create order";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  verifyRazorpayPayment: async (planId: string, payment) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<{ success: boolean; data: SubscriptionStatus }>(
        "/subscriptions/razorpay/verify",
        { planId, ...payment }
      );
      set({ status: res.data.data, isLoading: false });
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? err.message ?? "Payment verification failed";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  cancelSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<{ success: boolean; data: SubscriptionStatus }>(
        "/subscriptions/cancel"
      );
      set({ status: res.data.data, isLoading: false });
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? err.message ?? "Failed to cancel subscription";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  reset: () => {
    set({ status: null, plans: [], isLoading: false, error: null });
  },
}));
