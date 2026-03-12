"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useGenerationStore } from "@/stores/generation.store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertTriangle, Info } from "lucide-react";

interface ImageUploadCardProps {
  contentType: "EVENT" | "POSTER";
  variant?: "vertical" | "horizontal";
}

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DIMENSION = 768;
const RECOMMENDED_MIN = 1024;

export function ImageUploadCard({ contentType, variant = "vertical" }: ImageUploadCardProps) {
  const router = useRouter();
  const { setUploadedImage, setContentType, reset } = useGenerationStore();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setWarning(null);
    setDimensions(null);

    if (!ACCEPTED_FORMATS.includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are accepted.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be under 10 MB.");
      return;
    }

    // Check image dimensions before accepting
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setDimensions({ w, h });

      if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
        setError(
          `Image is too small (${w}x${h}px). Minimum ${MIN_DIMENSION}x${MIN_DIMENSION}px required for AI generation.`
        );
        URL.revokeObjectURL(url);
        return;
      }

      if (w < RECOMMENDED_MIN || h < RECOMMENDED_MIN) {
        setWarning(
          `Image is ${w}x${h}px. For best results, use at least ${RECOMMENDED_MIN}x${RECOMMENDED_MIN}px.`
        );
      }

      setPreview(url);
      setFileName(file.name);
      setUploadedFile(file);
    };
    img.onerror = () => {
      setError("Unable to read image. The file may be corrupt.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    setUploadedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleUseImage() {
    if (!uploadedFile || !preview) return;
    reset();
    setContentType(contentType);
    setUploadedImage(uploadedFile, preview);
    router.push(`/generate?uploadImage=true&type=${contentType}`);
  }

  if (preview) {
    return (
      <Card className="flex h-full flex-col overflow-hidden border-2 border-primary/40 bg-primary/5">
        <div className={`relative w-full shrink-0 bg-muted ${variant === "horizontal" ? "aspect-[21/9] sm:aspect-[16/6]" : "aspect-[3/4]"}`}>
          <Image
            src={preview}
            alt="Uploaded preview"
            fill
            className="object-cover"
          />
          <button
            onClick={clearPreview}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground transition hover:bg-background hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium">
            {fileName}
          </p>
          {dimensions && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dimensions.w} x {dimensions.h}px
            </p>
          )}
          {warning && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-yellow-50 px-2 py-1.5 text-xs text-yellow-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
          <div className="mt-auto pt-2">
            <Button onClick={handleUseImage} className="w-full" size="sm">
              Use This Image
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => inputRef.current?.click()}
      className={`group flex h-full cursor-pointer items-center justify-center border-2 border-dashed transition hover:border-primary/50 hover:bg-primary/5 ${
        variant === "horizontal" ? "flex-col sm:flex-row gap-4 px-6 py-6" : "flex-col px-4 py-12"
      }`}
    >
      <div className={`flex items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110 ${variant === "horizontal" ? "h-14 w-14 shrink-0" : "mb-4 h-16 w-16"}`}>
        <Upload className={variant === "horizontal" ? "h-6 w-6" : "h-8 w-8"} />
      </div>
      <div className={`flex flex-col ${variant === "horizontal" ? "text-center sm:text-left" : "text-center"}`}>
        <p className="text-base font-semibold text-gray-900 group-hover:text-primary-700">
          Upload your own image
        </p>
        <p className={`mt-1 text-sm text-gray-500 ${variant === "horizontal" ? "" : ""}`}>
          JPG, PNG, WebP up to 10 MB
        </p>
        <div className={`mt-2 flex items-center gap-1.5 text-xs text-gray-400 ${variant === "horizontal" ? "justify-center sm:justify-start" : "justify-center"}`}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Recommended {RECOMMENDED_MIN}x{RECOMMENDED_MIN}px+</span>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </Card>
  );
}
