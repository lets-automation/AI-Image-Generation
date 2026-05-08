import { apiClient } from "./api-client";
import type {
  ApiResponse,
  PaginationMeta,
  QualityTier,
  VideoDuration,
} from "@ep/shared";

// ─── Types ──────────────────────────────────────────────

export interface VideoGenerationItem {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  jobType: "VIDEO";
  qualityTier: QualityTier;
  prompt: string | null;
  baseImageUrl: string | null;
  templateId: string | null;
  resultVideoUrl: string | null;
  /** Actual delivered duration. Equal to requestedDurationSec on full success. */
  videoDurationSec: number | null;
  videoResolution: string | null;
  /** Credits actually billed. Equal to original quote unless `partial` is true. */
  creditCost: number;
  /** True when a 30s output was salvaged as 15s after a clip-2 failure. */
  partial: boolean;
  /** Upstream reason that caused the partial result (e.g., Seedance moderation). */
  partialReason: string | null;
  /** What the user originally asked for, kept around for the partial-result notice. */
  requestedDurationSec: number | null;
  /** Credits refunded for the missing portion when partial. */
  refundedCredits: number | null;
  errorMessage: string | null;
  processingMs: number | null;
  createdAt: string;
}

export interface CreateVideoRequest {
  templateId?: string;
  /** First entry becomes the conditioning first frame; the rest are reference images. */
  baseImageUrls?: string[];
  qualityTier: QualityTier;
  durationSec: VideoDuration;
  /**
   * Per-clip prompts. Length must equal ceil(durationSec / 15) — 1 entry for
   * 15s, 2 entries for 30s. Each entry is moderated independently and routes
   * to its own Seedance clip, so the user can split a 30s narrative across
   * the two 15s windows instead of squishing it all into clip 0.
   */
  prompts: string[];
}

export interface CreateVideoResponse {
  id: string;
  status: string;
  qualityTier: QualityTier;
  durationSec: VideoDuration;
  creditCost: number;
  jobType: "VIDEO";
}

export interface VideoStatusUpdate {
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";
  progress: number;
  jobType?: "IMAGE" | "VIDEO";
  resultVideoUrl?: string | null;
  resultImageUrl?: string | null;
  errorMessage?: string | null;
  step?: string;
}

// ─── API ────────────────────────────────────────────────

export const videoApi = {
  /** Create a new image-to-video generation request. */
  create: async (input: CreateVideoRequest): Promise<CreateVideoResponse> => {
    const { data } = await apiClient.post<ApiResponse<CreateVideoResponse>>(
      "/videos",
      input
    );
    return data.data as CreateVideoResponse;
  },

  /** List the current user's video generations. */
  list: async (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.status) query.set("status", params.status);

    const { data } = await apiClient.get<
      ApiResponse<VideoGenerationItem[]> & { meta: PaginationMeta }
    >(`/videos?${query.toString()}`);
    return {
      videos: (data.data ?? []) as VideoGenerationItem[],
      meta: data.meta as PaginationMeta,
    };
  },

  getById: async (id: string): Promise<VideoGenerationItem> => {
    const { data } = await apiClient.get<ApiResponse<VideoGenerationItem>>(
      `/videos/${id}`
    );
    return data.data as VideoGenerationItem;
  },

  /**
   * Upload a source image to Cloudinary and return its URL.
   * Reuses the existing image upload endpoint that the image flow uses.
   */
  uploadSourceImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("baseImage", file);
    const { data } = await apiClient.post<
      ApiResponse<{ url: string; width: number; height: number }>
    >("/users/upload-base-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const url = data.data?.url;
    if (!url) throw new Error("Upload returned no URL");
    return url;
  },

  /**
   * Upload multiple source images sequentially and return their URLs in
   * the same order. Sequential (not parallel) so a partial failure stops
   * cleanly without orphaning later uploads — and so the upload endpoint's
   * per-IP rate limit isn't tripped by a burst.
   */
  uploadSourceImages: async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      urls.push(await videoApi.uploadSourceImage(file));
    }
    return urls;
  },
};

/**
 * Build the Cloudinary thumbnail URL for a video. Cloudinary auto-generates
 * a poster frame for any video asset via the `.jpg` extension on the upload URL.
 *
 * If the video URL is from somewhere else, returns null and callers fall back
 * to a placeholder.
 */
export function videoThumbnailUrl(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  // Match standard Cloudinary video upload URLs and swap the extension.
  const cloudinaryMatch = videoUrl.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/[^.]+)\.[a-z0-9]+$/i
  );
  if (cloudinaryMatch) {
    // so_0 = capture frame at 0s; ensures we always get a valid still
    return `${cloudinaryMatch[1]}.jpg`;
  }
  return null;
}
