"use client";

import { Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex lg:w-1/2">
        <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent-600/20 blur-[100px]" />
        
        <div className="relative z-10 flex items-center gap-2 text-xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary-400" />
          EP Product
        </div>
        
        <div className="relative z-10">
          <blockquote className="space-y-4">
            <p className="text-2xl font-medium leading-relaxed tracking-wide text-zinc-100">
              "Generate stunning festival creatives in multiple languages with AI&#8209;powered enhancements."
            </p>
            <footer className="text-base text-zinc-400 border-l-2 border-primary-500 pl-4">
              Built for businesses, educators, and creators.
            </footer>
          </blockquote>
        </div>
        
        <p className="relative z-10 text-sm text-zinc-500">
          &copy; {new Date().getFullYear()} EP Product. All rights reserved.
        </p>
      </div>

      {/* Auth form area */}
      <div className="flex w-full items-center justify-center bg-zinc-50 px-4 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-zinc-200 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
