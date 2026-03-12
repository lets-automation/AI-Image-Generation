"use client";

import { ReactNode, FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  loading?: boolean;
  maxWidth?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  loading = false,
  maxWidth,
}: FormDialogProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${maxWidth || "sm:max-w-[480px]"} gap-0 overflow-hidden p-0 sm:max-h-[90vh] flex flex-col`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden h-full">
          <DialogHeader className="border-b border-border bg-muted/30 px-6 py-5 shrink-0">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 px-6 py-5 overflow-y-auto">{children}</div>
          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
