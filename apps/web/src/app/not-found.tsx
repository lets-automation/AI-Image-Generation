import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-bold text-primary-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mt-2 text-sm text-gray-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/events"
            className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            Go to Events
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
