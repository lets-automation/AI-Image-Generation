"use client";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex lg:w-1/2">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-[500px] w-[500px] rounded-full bg-primary-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-accent-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/10 blur-[80px]" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 shadow-lg">
            <span className="text-base font-extrabold tracking-tight text-white">EP</span>
          </div>
          <span className="text-xl font-bold tracking-tight">EP Product</span>
        </div>

        {/* Quote + features */}
        <div className="relative z-10 space-y-10">
          <blockquote className="space-y-4">
            <p className="text-3xl font-semibold leading-snug tracking-tight text-white">
              Festival creatives,
              <br />
              <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                powered by AI.
              </span>
            </p>
            <p className="max-w-sm text-base leading-relaxed text-zinc-400">
              Generate stunning visuals in 10+ languages with a single click. Built for businesses, educators, and creators.
            </p>
          </blockquote>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "AI-Powered", desc: "Smart generation engine" },
              { label: "10+ Languages", desc: "Hindi, Arabic, CJK & more" },
              { label: "Multiple Sizes", desc: "Square, story, landscape" },
              { label: "Instant Export", desc: "Download in seconds" },
            ].map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-sm font-semibold text-white">{f.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-sm text-zinc-600">
          &copy; {new Date().getFullYear()} EP Product. All rights reserved.
        </p>
      </div>

      {/* Auth form area */}
      <div className="flex w-full items-center justify-center bg-gray-50 px-4 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-gray-200/50 ring-1 ring-gray-100 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
