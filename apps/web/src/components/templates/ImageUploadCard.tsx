"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useGenerationStore } from "@/stores/generation.store";
import { useAuthStore } from "@/stores/auth.store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertTriangle, Info } from "lucide-react";

interface ImageUploadCardProps {
  contentType: "EVENT" | "POSTER";
  variant?: "vertical" | "horizontal";
}

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 6;



export function ImageUploadCard({ contentType, variant = "vertical" }: ImageUploadCardProps) {
  const router = useRouter();
  const { setUploadedImages, setContentType, reset } = useGenerationStore();
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<Array<{ w: number; h: number }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function readImage(file: File): Promise<{ preview: string; width: number; height: number; warning?: string }> {
    const preview = URL.createObjectURL(file);
    const image = new window.Image();

    const dimensionsResult = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => reject(new Error("Unable to read image"));
      image.src = preview;
    });

    return {
      preview,
      width: dimensionsResult.width,
      height: dimensionsResult.height,
    };
  }

  async function handleFiles(files: File[], append = false) {
    setError(null);

    if (files.length === 0) return;

    const existingCount = append ? uploadedFiles.length : 0;
    const nextCount = existingCount + files.length;
    if (nextCount > MAX_FILES) {
      setError(`You can upload up to ${MAX_FILES} images total.`);
      return;
    }

    for (const file of files) {
      if (!ACCEPTED_FORMATS.includes(file.type)) {
        setError("Only JPG, PNG, and WebP images are accepted.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is larger than 10 MB.`);
        return;
      }
    }

    if (!append) {
      for (const existingPreview of previews) {
        URL.revokeObjectURL(existingPreview);
      }
    }

    try {
      const results = await Promise.all(files.map((file) => readImage(file)));

      const nextFiles = append ? [...uploadedFiles, ...files] : files;
      const nextPreviews = append ? [...previews, ...results.map((result) => result.preview)] : results.map((result) => result.preview);
      const nextDimensions = append
        ? [...dimensions, ...results.map((result) => ({ w: result.width, h: result.height }))]
        : results.map((result) => ({ w: result.width, h: result.height }));
      setUploadedFiles(nextFiles);
      setPreviews(nextPreviews);
      setDimensions(nextDimensions);
      setWarnings([]);


    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read image. The file may be corrupt.");
      if (!append) {
        setUploadedFiles([]);
        setPreviews([]);
        setDimensions([]);
        setWarnings([]);
      }
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    void handleFiles(files, previews.length > 0);
    event.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    void handleFiles(files, previews.length > 0);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function clearPreviews() {
    for (const preview of previews) {
      URL.revokeObjectURL(preview);
    }
    setPreviews([]);
    setUploadedFiles([]);
    setDimensions([]);
    setWarnings([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeImage(index: number) {
    const nextFiles = uploadedFiles.filter((_, currentIndex) => currentIndex !== index);
    const nextPreviews = previews.filter((_, currentIndex) => currentIndex !== index);
    const nextDimensions = dimensions.filter((_, currentIndex) => currentIndex !== index);

    if (previews[index]) {
      URL.revokeObjectURL(previews[index]);
    }

    setUploadedFiles(nextFiles);
    setPreviews(nextPreviews);
    setDimensions(nextDimensions);
    setWarnings((currentWarnings) =>
      currentWarnings.filter((warning) => !warning.startsWith(`${uploadedFiles[index]?.name}:`))
    );



    if (nextFiles.length === 0 && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleUseImages() {
    if (uploadedFiles.length === 0 || previews.length === 0) return;
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    reset();
    setContentType(contentType);
    setUploadedImages(uploadedFiles, previews, "COMBINE");
    router.push(`/generate?uploadImage=true&type=${contentType}`);
  }

  if (previews.length > 0) {
    const mainPreview = previews[0];

    return (
      <Card className="flex flex-col overflow-hidden border-2 border-primary/40 bg-primary/5">
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              {uploadedFiles.length} image{uploadedFiles.length > 1 ? "s" : ""} selected
            </p>
            <button
              onClick={clearPreviews}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          </div>

          {/* Thumbnail grid */}
          <div className={`grid gap-2 max-w-sm ${previews.length === 1 ? "grid-cols-1 max-w-[200px]" : previews.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {previews.map((preview, index) => (
              <div key={`preview-${index}`} className="group relative overflow-hidden rounded-lg border bg-muted">
                <div className="relative aspect-square">
                  <Image
                    src={preview}
                    alt={uploadedFiles[index]?.name || `Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
                  aria-label={`Remove ${uploadedFiles[index]?.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                  {uploadedFiles[index]?.name}
                </p>
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-yellow-50 px-2 py-1.5 text-xs text-yellow-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warnings[0]}</span>
            </div>
          )}

          <div className="mt-auto pt-2">
            {uploadedFiles.length < MAX_FILES && (
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                className="mb-2 w-full"
                size="sm"
              >
                Add More Images
              </Button>
            )}
            <Button onClick={handleUseImages} className="w-full" size="sm">
              Use Selected Image{uploadedFiles.length > 1 ? "s" : ""}
            </Button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleChange}
          className="hidden"
        />
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
          Upload your own images
        </p>
        <p className={`mt-1 text-sm text-gray-500 ${variant === "horizontal" ? "" : ""}`}>
          JPG, PNG, WebP up to 10 MB each
        </p>
        <div className={`mt-2 flex items-center gap-1.5 text-xs text-gray-400 ${variant === "horizontal" ? "justify-center sm:justify-start" : "justify-center"}`}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Up to {MAX_FILES} images</span>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </Card>
  );
}
