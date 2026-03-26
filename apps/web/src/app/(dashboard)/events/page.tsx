"use client";

import { useEffect, useMemo } from "react";
import { useBrowseStore } from "@/stores/browse.store";
import { CategoryFilter } from "@/components/templates/CategoryFilter";
import { FestivalBanner } from "@/components/templates/FestivalBanner";
import { ImageUploadCard } from "@/components/templates/ImageUploadCard";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { PublicFeed } from "@/components/templates/PublicFeed";

export default function EventsPage() {
  const {
    templates,
    meta,
    isLoading,
    categories,
    festivals,
    categoryId,
    aspectRatio,
    page,
    categoriesLoaded,
    groupedCategories,
    searchQuery,
    setCategoryId,
    setAspectRatio,
    setPage,
    fetchTemplates,
    fetchGroupedCategories,
    fetchCategories,
    fetchFestivals,
    setContentType,
  } = useBrowseStore();

  const contentType = useBrowseStore((s) => s.contentType);

  useEffect(() => {
    const store = useBrowseStore.getState();
    if (store.contentType !== "EVENT") {
      setContentType("EVENT");
      setAspectRatio("SQUARE"); // default for Events based on mockup
    }
    fetchCategories("EVENT");
    fetchFestivals("EVENT");
  }, [setContentType, setAspectRatio, fetchCategories, fetchFestivals]);

  useEffect(() => {
    if (contentType !== "EVENT") return;
    const timer = setTimeout(() => {
      const currentCategoryId = useBrowseStore.getState().categoryId;
      if (currentCategoryId) {
        fetchTemplates();
      } else {
        fetchGroupedCategories();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [contentType, categoryId, aspectRatio, page, searchQuery, fetchTemplates, fetchGroupedCategories]);

  // Derive category counts from groupedCategories (which respects aspectRatio)
  const filteredCategories = useMemo(() => {
    if (!groupedCategories.length) return categories;
    const groupedMap = new Map(
      groupedCategories.map((g) => [g.id, g.templates.length])
    );
    return categories
      .map((cat) => ({
        ...cat,
        _count: { templates: groupedMap.get(cat.id) ?? 0 },
      }))
      .filter((cat) => (cat._count?.templates ?? 0) > 0);
  }, [categories, groupedCategories]);

  return (
    <div>
      <div className="mb-6 md:hidden">
        {/* Mobile Mockup doesn't show header text here, so we remove it */}
      </div>
      <div className="mb-6 hidden md:block">
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse event templates or upload your own image
        </p>
      </div>

      <>
          <div className="mb-6 flex flex-col items-center gap-4 md:flex-row md:justify-between">
            <Tabs
              value={aspectRatio || "SQUARE"}
              onValueChange={(v) => setAspectRatio(v as any)}
              className="w-full md:w-auto"
            >
              <TabsList className="grid h-12 w-full grid-cols-3 rounded-xl border border-gray-200/50 bg-gray-100/80 p-1">
                <TabsTrigger value="SQUARE" className="rounded-lg text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-primary-700 data-[state=active]:shadow-sm">Square</TabsTrigger>
                <TabsTrigger value="PORTRAIT" className="rounded-lg text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-primary-700 data-[state=active]:shadow-sm">Portrait</TabsTrigger>
                <TabsTrigger value="LANDSCAPE" className="rounded-lg text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-primary-700 data-[state=active]:shadow-sm">Landscape</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input 
                  type="search" 
                  placeholder="Search events..." 
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    useBrowseStore.getState().setSearchQuery(val);
                  }}
                  className="h-11 rounded-xl border-gray-200 bg-white pl-10 shadow-sm transition-all focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
            </div>
          </div>

          {festivals.length > 0 && (
            <FestivalBanner festivals={festivals} />
          )}

          <div className="mb-6">
            <CategoryFilter
              categories={filteredCategories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              loading={!categoriesLoaded}
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {categoryId === null && !searchQuery ? (
                <div className="space-y-8">
                  {/* Custom Upload Banner */}
                  <div className="flex flex-col gap-6 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-primary-950 to-accent-950 p-8 shadow-xl ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative z-10 flex-1">
                      <h2 className="text-2xl font-bold tracking-tight text-white">Got a custom photo?</h2>
                      <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-300">
                        Upload your own base image for your event and start generating beautifully branded creatives instantly.
                      </p>
                    </div>
                    <div className="relative z-10 w-full shrink-0 sm:w-1/2 md:w-[400px] group">
                      <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 opacity-20 blur transition duration-500 group-hover:opacity-40"></div>
                      <div className="relative h-full rounded-xl bg-white/95 backdrop-blur-sm shadow-sm transition hover:bg-white">
                        <ImageUploadCard contentType="EVENT" variant="horizontal" />
                      </div>
                    </div>
                  </div>

                  {groupedCategories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No templates found for this aspect ratio</p>
                      <p className="mt-1 text-xs">Try selecting a different tab.</p>
                    </div>
                  ) : (
                    groupedCategories.map((group) => (
                      <div key={group.id} className="flex flex-col">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">{group.name}</h2>
                            <span className="text-xs text-gray-500">Today</span>
                          </div>
                          <button
                            onClick={() => setCategoryId(group.id)}
                            className="text-sm font-semibold text-primary"
                          >
                            See All
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {group.templates.slice(0, 5).map((template) => (
                            <TemplateCard key={template.id} template={template} contentType="EVENT" />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <ImageUploadCard contentType="EVENT" />
                    {templates.map((template) => (
                      <TemplateCard key={template.id} template={template} contentType="EVENT" />
                    ))}
                  </div>

                  {templates.length === 0 && (
                    <div className="mt-8 text-center text-sm text-muted-foreground">
                      No templates available in this category.
                    </div>
                  )}

                  {categoryId !== null && meta && meta.totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                        Previous
                      </Button>
                      <span className="px-3 text-sm text-muted-foreground">
                        Page {meta.page} of {meta.totalPages}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= meta.totalPages}>
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!isLoading && meta && templates.length > 0 && categoryId !== null && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Showing {templates.length} out of {meta.total} templates
            </p>
          )}

          {/* Community Showcase */}
          <div className="mt-10">
            <PublicFeed contentType="EVENT" />
          </div>
        </>
    </div>
  );
}
