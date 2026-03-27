"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import toast from "react-hot-toast";
import Script from "next/script";
import { detectClientCountryCode } from "@/lib/country-detect";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export default function LoginPage() {
  const router = useRouter();
  const { googleLogin } = useAuthStore();
  const [gsiReady, setGsiReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Check if GSI is already loaded (e.g. after logout redirect)
  useEffect(() => {
    if (window.google?.accounts?.id) {
      setGsiReady(true);
    }
  }, []);

  const renderGoogleButton = useCallback(() => {
    if (!window.google?.accounts?.id || !googleBtnRef.current || !GOOGLE_CLIENT_ID) return;

    // Clear previous button content
    googleBtnRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          const country = detectClientCountryCode();
          await useAuthStore.getState().googleLogin(response.credential, country);
          toast.success("Welcome!");
          const user = useAuthStore.getState().user;
          if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
            router.push("/admin");
          } else {
            router.push("/events");
          }
        } catch {
          toast.error("Google sign-in failed. Please try again.");
        }
      },
    });

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: googleBtnRef.current.offsetWidth,
      text: "signin_with",
      shape: "pill",
      logo_alignment: "left",
    });
  }, [router]);

  useEffect(() => {
    if (gsiReady) {
      renderGoogleButton();
    }
  }, [gsiReady, renderGoogleButton]);

  return (
    <div className="flex flex-col items-center space-y-8">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={() => setGsiReady(true)}
        strategy="afterInteractive"
      />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-500">
          Create stunning festival creatives with AI
        </p>
      </div>

      <div className="w-full">
        {GOOGLE_CLIENT_ID ? (
          <div ref={googleBtnRef} className="flex min-h-[48px] items-center justify-center" />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
            Google Sign-In is not configured yet. Please contact the administrator.
          </div>
        )}
      </div>

      <div className="flex items-center gap-6 pt-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Secure login
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Privacy first
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Instant access
        </div>
      </div>
    </div>
  );
}
