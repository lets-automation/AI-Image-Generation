"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
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

export default function RegisterPage() {
  const router = useRouter();
  const [gsiReady, setGsiReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.google?.accounts?.id) {
      setGsiReady(true);
    }
  }, []);

  const renderGoogleButton = useCallback(() => {
    if (!window.google?.accounts?.id || !googleBtnRef.current || !GOOGLE_CLIENT_ID) return;

    googleBtnRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          const country = detectClientCountryCode();
          await useAuthStore.getState().googleLogin(response.credential, country);
          toast.success("Account created!");
          router.push("/events");
        } catch {
          toast.error("Sign-up failed. Please try again.");
        }
      },
    });

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: googleBtnRef.current.offsetWidth,
      text: "signup_with",
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create your account</h1>
        <p className="mt-2 text-sm text-gray-500">
          Start generating festival creatives in minutes
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

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
