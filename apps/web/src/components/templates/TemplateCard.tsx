"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TemplateItem } from "@/lib/user-api";
import { ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";

interface TemplateCardProps {
  template: TemplateItem;
  contentType: "EVENT" | "POSTER";
}

export function TemplateCard({ template, contentType }: TemplateCardProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const generateUrl = `/generate?templateId=${template.id}&type=${contentType}`;

  function handleGenerateClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    router.push(generateUrl);
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 hover:ring-gray-300/60 hover:-translate-y-1">
      {/* Image — fixed aspect-square for uniform grid */}
      <Link href={generateUrl} onClick={handleGenerateClick} className="block">
        <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
          <Image
            src={template.imageUrl}
            alt={template.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="w-full p-3">
              <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-lg transition-transform duration-200 group-hover:scale-[1.02]">
                <ArrowRight className="h-4 w-4 text-primary-500" />
                {isAuthenticated ? "Use Template" : "Login to Generate"}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="px-3 pb-3 pt-2.5">
        <h3 className="truncate text-sm font-semibold text-gray-900">
          {template.name}
        </h3>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
            {template.category.name}
          </span>
          <span className="text-[11px] text-gray-400">
            {template.usageCount > 0 ? `${template.usageCount} uses` : "New"}
          </span>
        </div>
      </div>

      {/* Mobile: always-visible Generate link */}
      <div className="px-3 pb-3 lg:hidden">
        <button
          onClick={handleGenerateClick}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {isAuthenticated ? "Use Template" : "Login to Generate"}
        </button>
      </div>
    </div>
  );
}
