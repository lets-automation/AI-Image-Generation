"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const refreshToken = localStorage.getItem("ep_refresh_token");
    if (refreshToken) {
      // User has a session — redirect to dashboard
      router.replace("/posters");
    } else {
      setChecking(false);
    }
  }, [router]);

  // Show a brief loading state while checking auth
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900">
      {/* Decorative background blurs */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-[500px] w-[500px] rounded-full bg-primary-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-[500px] w-[500px] rounded-full bg-accent-600/20 blur-[120px]" />

      <div className="relative z-10 mx-4 w-full max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 text-sm font-medium text-primary-200 backdrop-blur-md">
          <Sparkles className="h-4 w-4" />
          AI-Powered Generation
        </div>
        
        <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
          EP Product
        </h1>
        
        <p className="mx-auto mt-6 max-w-xl text-lg tracking-wide text-gray-300 sm:text-xl">
          Generate stunning, professional festival creatives in seconds.
        </p>
        
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="group flex items-center justify-center rounded-xl bg-white px-8 py-4 text-base font-bold text-gray-900 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all hover:scale-105 hover:bg-gray-50 active:scale-95"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-base font-bold text-white backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/10 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
