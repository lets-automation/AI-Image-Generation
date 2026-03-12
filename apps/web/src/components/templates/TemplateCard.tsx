"use client";

import Image from "next/image";
import Link from "next/link";
import type { TemplateItem } from "@/lib/user-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface TemplateCardProps {
  template: TemplateItem;
  contentType: "EVENT" | "POSTER";
}

export function TemplateCard({ template, contentType }: TemplateCardProps) {
  const aspectRatio = template.height / template.width;
  const generateUrl = `/generate?templateId=${template.id}&type=${contentType}`;

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
      {/* Image */}
      <Link href={`/templates/${template.id}`} className="block">
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{ paddingBottom: `${Math.min(aspectRatio * 100, 150)}%` }}
        >
          <Image
            src={template.imageUrl}
            alt={template.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>
      </Link>

      {/* Info */}
      <CardContent className="p-3">
        <h3 className="truncate text-sm font-semibold">
          {template.name}
        </h3>
        <div className="mt-1.5 flex items-center justify-between">
          <Badge variant="secondary" className="text-[11px]">
            {template.category.name}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {template.usageCount} uses
          </span>
        </div>

        {/* Generate CTA */}
        <Button asChild className="mt-2.5 w-full" size="sm">
          <Link href={generateUrl}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Use Template
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
