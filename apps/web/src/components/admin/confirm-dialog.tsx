"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Info } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Continue",
  variant = "default",
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[420px]">
        <AlertDialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
                isDestructive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isDestructive ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Info className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-1 pt-0.5">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-2 bg-muted/20 px-6 py-4">
          <AlertDialogCancel className="mt-0">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              "mt-0",
              isDestructive && buttonVariants({ variant: "destructive" })
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
