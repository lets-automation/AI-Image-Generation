export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Title skeleton */}
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-6">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-8 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="animate-pulse rounded-xl border border-border bg-card p-4">
        <div className="mb-4 h-5 w-32 rounded bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
