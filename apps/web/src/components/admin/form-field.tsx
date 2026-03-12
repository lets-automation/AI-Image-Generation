"use client";

import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-center gap-1.5 text-sm font-medium text-foreground/90">
        {label}
        {required && <span className="text-destructive">*</span>}
        {description && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/50 transition-colors hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                {description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
