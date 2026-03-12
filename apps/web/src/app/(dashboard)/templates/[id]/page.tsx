"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { userApi, type TemplateDetail } from "@/lib/user-api";
import { TIER_CONFIGS } from "@ep/shared";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles, Coins } from "lucide-react";

export default function TemplateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await userApi.getTemplate(id);
        setTemplate(data);
      } catch {
        toast.error("Template not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Skeleton className="mb-4 h-8 w-48" />
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold">Template not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This template may have been removed or deactivated.
        </p>
        <Button asChild className="mt-4">
          <Link href="/events">Browse Templates</Link>
        </Button>
      </div>
    );
  }

  const tiers = Object.values(TIER_CONFIGS);
  const generateUrl = `/generate?templateId=${template.id}&type=${template.contentType}`;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Back navigation */}
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href={template.contentType === "EVENT" ? "/events" : "/posters"}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to {template.contentType === "EVENT" ? "Events" : "Posters"}
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: Template Preview */}
        <div>
          <div className="overflow-hidden rounded-2xl border bg-muted shadow-lg">
            <div className="relative" style={{ paddingBottom: `${(template.height / template.width) * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.imageUrl}
                alt={template.name}
                className="absolute inset-0 h-full w-full object-contain"
              />

              {/* Safe zone overlay */}
              {template.safeZones.map((zone) => (
                <div
                  key={zone.id}
                  className="absolute border-2 border-dashed border-primary/50 bg-primary/10"
                  style={{
                    left: `${zone.x}%`,
                    top: `${zone.y}%`,
                    width: `${zone.width}%`,
                    height: `${zone.height}%`,
                  }}
                  title={`${zone.type} -- ${zone.position}`}
                >
                  <span className="absolute -top-5 left-0 rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">
                    {zone.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {template.width} x {template.height}px &middot; Version {template.layoutVersion} &middot; {template.safeZones.length} safe zone{template.safeZones.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Right: Template Info + Actions */}
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{template.contentType}</Badge>
            <Badge variant="secondary">{template.category.name}</Badge>
            <Badge variant="outline">{template.usageCount} uses</Badge>
          </div>

          {/* Category Fields */}
          {template.category.fieldSchemas.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">
                Fields you&apos;ll customize:
              </h3>
              <div className="mt-2 space-y-2">
                {template.category.fieldSchemas.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {field.label}
                      </span>
                      {field.isRequired && (
                        <Badge variant="destructive" className="text-[10px]">
                          Required
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {field.fieldType}
                      </Badge>
                      {field.hasPosition && (
                        <Badge variant="outline" className="text-[10px]">
                          Positionable
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quality Tiers */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold">
              Available Quality Tiers:
            </h3>
            <div className="mt-2 space-y-2">
              {tiers.map((tier) => (
                <Card key={tier.code}>
                  <CardContent className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{tier.label}</span>
                        <Badge variant="secondary" className="text-[10px]">AI-powered</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{tier.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-bold text-amber-600">
                      <Coins className="h-3.5 w-3.5" />
                      {tier.defaultCreditCost}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Generate CTA */}
          <div className="mt-8">
            <Button asChild size="lg" className="w-full text-base">
              <Link href={generateUrl}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Creative with This Template
              </Link>
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You&apos;ll choose quality tier, language, and fill in fields on the next page
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
