"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useAuth";
import { videoApi } from "@/lib/video-api";
import {
  ALL_TIERS,
  DEFAULT_VIDEO_CREDIT_COST_PER_15S,
  GENERATION_LIMITS,
  MAX_VIDEO_REFERENCE_IMAGES,
  SEEDANCE_MAX_NATIVE_DURATION_SEC,
  VIDEO_DURATIONS,
  VIDEO_TIER_CONFIGS,
  type QualityTier,
  type VideoDuration,
} from "@ep/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  X,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Plus,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT = GENERATION_LIMITS.MAX_PROMPT_LENGTH;

interface SourceImage {
  file: File;
  previewUrl: string;
}

/**
 * Local credit-cost preview. Mirrors `pricingService.getVideoCreditCost`:
 * per-15s × clipCount, falling back to {@link DEFAULT_VIDEO_CREDIT_COST_PER_15S}
 * if the admin hasn't set a Seedance ModelPricing row.
 *
 * The authoritative cost comes back in the create() response from the server —
 * this is just for the cost summary UI before submit.
 */
function previewCreditCost(tier: QualityTier, durationSec: VideoDuration): number {
  const per15s = DEFAULT_VIDEO_CREDIT_COST_PER_15S[tier];
  const clipCount = Math.ceil(durationSec / SEEDANCE_MAX_NATIVE_DURATION_SEC);
  return per15s * clipCount;
}

export default function NewVideoPage() {
  const router = useRouter();
  useRequireAuth();

  const [images, setImages] = useState<SourceImage[]>([]);
  // Per-clip prompts. Slot 0 covers 0–15s; slot 1 covers 15–30s and is only
  // surfaced/sent when duration === 30. Storing both regardless of duration
  // means switching durations preserves anything the user already typed.
  const [prompts, setPrompts] = useState<[string, string]>(["", ""]);
  const [tier, setTier] = useState<QualityTier>("STANDARD");
  const [duration, setDuration] = useState<VideoDuration>(15);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<"" | "uploading" | "queueing">("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function setPromptAt(index: 0 | 1, value: string) {
    setPrompts((prev) => {
      const next: [string, string] = [prev[0], prev[1]];
      next[index] = value;
      return next;
    });
  }

  // Revoke any preview blob URLs we created when the page unmounts so we
  // don't leak object URLs in long sessions.
  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(incoming: File[]) {
    setErrorMessage(null);
    if (incoming.length === 0) return;

    const remaining = MAX_VIDEO_REFERENCE_IMAGES - images.length;
    if (remaining <= 0) {
      setErrorMessage(
        `You've already added the maximum of ${MAX_VIDEO_REFERENCE_IMAGES} images.`
      );
      return;
    }

    const accepted: SourceImage[] = [];
    for (const file of incoming.slice(0, remaining)) {
      if (!ACCEPTED.includes(file.type)) {
        setErrorMessage("Image must be JPG, PNG, or WebP.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setErrorMessage(`"${file.name}" is larger than 10 MB.`);
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    if (accepted.length === 0) return;

    setImages((prev) => [...prev, ...accepted]);

    if (incoming.length > remaining) {
      setErrorMessage(
        `Only added ${remaining} of ${incoming.length} files — limit is ${MAX_VIDEO_REFERENCE_IMAGES}.`
      );
    }
  }

  function removeImageAt(index: number) {
    setImages((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function moveImageUp(index: number) {
    if (index === 0) return;
    setImages((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  async function handleGenerate() {
    setErrorMessage(null);

    // For 30s: send 2 prompts (one per 15s clip). For 15s: send only the first.
    const activePrompts = duration === 30 ? prompts : ([prompts[0]] as const);
    const trimmedPrompts = activePrompts.map((p) => p.trim());

    for (let i = 0; i < trimmedPrompts.length; i++) {
      const p = trimmedPrompts[i];
      const label =
        duration === 30 ? `Clip ${i + 1} prompt` : "Prompt";
      if (p.length < 5) {
        setErrorMessage(
          duration === 30
            ? `Please describe what should happen in clip ${i + 1} (${i * 15}–${(i + 1) * 15}s).`
            : "Please describe what should happen in the video."
        );
        return;
      }
      if (p.length > MAX_PROMPT) {
        setErrorMessage(`${label} must be at most ${MAX_PROMPT} characters.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      let uploadedUrls: string[] | undefined;
      if (images.length > 0) {
        setSubmitStep("uploading");
        uploadedUrls = await videoApi.uploadSourceImages(
          images.map((i) => i.file)
        );
      }

      setSubmitStep("queueing");
      const created = await videoApi.create({
        baseImageUrls: uploadedUrls,
        qualityTier: tier,
        durationSec: duration,
        prompts: trimmedPrompts as string[],
      });

      router.push(`/videos/${created.id}`);
    } catch (err: unknown) {
      // The API wraps errors as { success: false, error: { code, message, details } }.
      // Prefer that message so users see "Insufficient credits: balance 0, required 150"
      // or "Active subscription required" instead of axios's generic
      // "Request failed with status code 402".
      const e = err as {
        response?: {
          data?: {
            error?: { code?: string; message?: string };
            message?: string;
          };
        };
        message?: string;
      };
      setErrorMessage(
        e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          e?.message ??
          "Failed to start video generation."
      );
      setSubmitting(false);
      setSubmitStep("");
    }
  }

  const cost = previewCreditCost(tier, duration);
  const submitLabel =
    submitStep === "uploading"
      ? `Uploading image${images.length > 1 ? "s" : ""}…`
      : submitStep === "queueing"
        ? "Queuing video…"
        : "Generate video";
  const canAddMore = images.length < MAX_VIDEO_REFERENCE_IMAGES;
  const activePromptValues = duration === 30 ? prompts : [prompts[0]];
  const anyPromptOverLimit = activePromptValues.some((p) => p.length > MAX_PROMPT);
  const anyPromptTooShort = activePromptValues.some((p) => p.trim().length < 5);

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Videos
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create video</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a {duration}-second video. Add up to{" "}
          {MAX_VIDEO_REFERENCE_IMAGES} reference images to control the look —
          or skip them and let Seedance generate from the prompt alone.
        </p>
      </div>

      <fieldset disabled={submitting} className="space-y-6">
        <FormBlock
          number={1}
          title={duration === 30 ? "Describe each 15-second segment" : "Describe the video"}
          description={
            duration === 30
              ? "Seedance generates 30-second videos as two stitched 15-second clips, each with its own audio. Write the script for each segment separately so the dialogue and action are scoped to that window."
              : "What should happen on screen? Concrete motion verbs work better than abstract direction. Long, structured prompts are fine."
          }
        >
          <div className="space-y-4">
            {activePromptValues.map((value, idx) => {
              const isOver = value.length > MAX_PROMPT;
              const segmentLabel =
                duration === 30
                  ? `Clip ${idx + 1} · ${idx * 15}–${(idx + 1) * 15}s`
                  : null;
              const placeholder =
                idx === 0
                  ? images.length > 0
                    ? "The woman slowly turns her head and smiles at the camera as the sun sets behind her."
                    : "A cinematic slow zoom across a quiet rainy street at night, neon reflections shimmering in puddles, distant figure walking under an umbrella."
                  : images.length > 0
                    ? "She walks forward into the warm light, raises her hand to wave, and the camera lingers as she steps out of frame."
                    : "The camera pulls back to reveal the full street; rain intensifies, a passing car splashes through a puddle, headlights sweep across the wet pavement.";
              return (
                <div key={idx} className="space-y-1.5">
                  {segmentLabel && (
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-foreground/80">
                        {segmentLabel}
                      </Label>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        own script + audio
                      </span>
                    </div>
                  )}
                  <Textarea
                    value={value}
                    onChange={(e) => setPromptAt(idx as 0 | 1, e.target.value)}
                    placeholder={placeholder}
                    rows={duration === 30 ? 4 : 5}
                    className="resize-y"
                  />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {duration === 30
                        ? idx === 0
                          ? "Sets the opening — first frame is your reference image."
                          : "Continues from the last frame of clip 1. Mention the same subject explicitly to keep identity consistent."
                        : images.length > 0
                          ? "Direct the motion — Seedance handles style from your images."
                          : "Text-to-video mode — be specific about scene, mood, camera, and motion."}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        isOver ? "font-medium text-destructive" : "text-muted-foreground/70"
                      )}
                    >
                      {value.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </FormBlock>

        <FormBlock
          number={2}
          title="Reference images (optional)"
          description={`Skip for text-to-video. Add 1 image to use it as the first frame. Add up to ${MAX_VIDEO_REFERENCE_IMAGES} for style / character locking. JPG, PNG, or WebP up to 10 MB each.`}
        >
          {images.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img, i) => (
                <div
                  key={img.previewUrl}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border bg-muted",
                    i === 0 && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                >
                  <Image
                    src={img.previewUrl}
                    alt={img.file.name}
                    fill
                    className="object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {i === 0 ? "First frame" : `Ref ${i}`}
                  </span>
                  <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-transparent via-transparent to-black/55 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => removeImageAt(i)}
                      className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => moveImageUp(i)}
                        className="self-start rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:bg-primary"
                      >
                        Make first frame
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {canAddMore && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    Add image
                  </span>
                </button>
              )}
            </div>
          )}

          {images.length === 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(Array.from(e.dataTransfer.files ?? []));
              }}
              className="flex w-full max-w-sm flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 px-6 py-10 text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
            >
              <Upload className="h-7 w-7" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop images or click to upload
                </p>
                <p className="mt-0.5 text-xs">
                  JPG, PNG, WebP · max 10 MB each · up to {MAX_VIDEO_REFERENCE_IMAGES} files
                </p>
              </div>
            </button>
          )}

          {images.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              {images.length} of {MAX_VIDEO_REFERENCE_IMAGES} · the first slot is
              the conditioning frame; hover any other to make it the first frame.
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              addFiles(files);
              e.target.value = "";
            }}
          />
        </FormBlock>

        <FormBlock
          number={3}
          title="Quality"
          description="Higher tiers use Seedance Pro and 1080p output."
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {ALL_TIERS.map((t) => {
              const config = VIDEO_TIER_CONFIGS[t];
              const isActive = tier === t;
              const tierCost = previewCreditCost(t, duration);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold">{config.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {config.resolution}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{config.variant}</p>
                  <p className="text-xs font-medium text-foreground/80">
                    {tierCost} credits
                  </p>
                </button>
              );
            })}
          </div>
        </FormBlock>

        <FormBlock
          number={4}
          title="Duration"
          description="30-second videos are produced as two stitched 15-second clips for smooth continuity."
        >
          <div className="flex gap-2.5">
            {VIDEO_DURATIONS.map((d) => {
              const isActive = duration === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-5 py-3 transition",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  )}
                >
                  <span className="text-base font-semibold">{d}s</span>
                  {d === 30 && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      2 clips
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </FormBlock>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Estimated cost
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {cost}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  credits
                </span>
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={anyPromptTooShort || anyPromptOverLimit || submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {submitLabel}
            </Button>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {errorMessage}
          </div>
        )}
      </fieldset>
    </div>
  );
}

function FormBlock({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {number}
        </span>
        <div>
          <Label className="text-sm font-medium">{title}</Label>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
