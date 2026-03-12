export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Title skeleton */}
      <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="h-48 bg-gray-200" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-8 w-24 rounded-lg bg-gray-200" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
