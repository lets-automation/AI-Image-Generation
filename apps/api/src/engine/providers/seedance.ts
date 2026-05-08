/**
 * Seedance 2.0 video provider — ByteDance via BytePlus ModelArk.
 *
 * Async task-based video generation. The flow is:
 *   1. POST /contents/generations/tasks  → returns task_id
 *   2. GET  /contents/generations/tasks/{task_id}  → poll until status is terminal
 *   3. Read result URL from succeeded response
 *
 * This client intentionally does NOT extend BaseProvider (which is image-only and
 * synchronous). Video generation has fundamentally different semantics — async,
 * per-second pricing, polling — so it lives behind its own interface.
 *
 * Native single-call duration is capped at 15 s (see SEEDANCE_MAX_NATIVE_DURATION_SEC).
 * Longer outputs are produced by the video-pipeline by stitching clips with
 * last-frame conditioning; this client only knows about single calls.
 */

import { config } from "../../config/index.js";
import { credentialService } from "../../services/credential.service.js";
import { logger } from "../../utils/logger.js";
import {
  BadRequestError,
  ModerationError,
  ServiceUnavailableError,
} from "../../utils/errors.js";

// ─── Public types ───────────────────────────────────────────

export type SeedanceResolution = "480p" | "720p" | "1080p";

export interface SeedanceSubmitInput {
  /** BytePlus model ID, e.g. "doubao-seedance-2-0-260128" */
  modelId: string;
  /** Free-text prompt describing the desired motion / scene direction */
  prompt: string;
  /**
   * Publicly accessible image URLs. The first entry is treated by Seedance
   * as the conditioning first frame; any additional entries become reference
   * images (style / character "omni-reference" mode). Native cap: 9.
   */
  imageUrls: string[];
  /** 4–15 seconds (Seedance native cap) */
  durationSec: number;
  resolution: SeedanceResolution;
  /** Aspect ratio. "adaptive" matches the input image — the safest default. */
  ratio?: string;
  /** Whether to embed Seedance's watermark. Default false. */
  watermark?: boolean;
  /**
   * Whether Seedance should generate native audio (ambient sounds, lip-sync
   * dialogue, sound effects) alongside the video. Default true — Seedance 2.0
   * advertises audio-video joint generation as a flagship feature.
   */
  generateAudio?: boolean;
  /** Optional deterministic seed (omit for varied outputs) */
  seed?: number;
  signal?: AbortSignal;
}

export interface SeedanceSubmitResult {
  taskId: string;
}

export type SeedanceTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface SeedanceTaskState {
  taskId: string;
  status: SeedanceTaskStatus;
  /** Present only when status === "succeeded" */
  videoUrl?: string;
  /** Present only when status === "failed" */
  errorMessage?: string;
  /** ARK does not always populate progress; treat as best-effort */
  progressPercent?: number;
  /** Raw upstream payload — useful for telemetry, never logged in full */
  raw?: Record<string, unknown>;
}

export interface SeedanceAwaitOptions {
  /**
   * Hard cap on total wait time. The poll loop honors AbortSignal sooner.
   * Defaults to {@link config.SEEDANCE_POLL_MAX_WAIT_MS}.
   */
  maxWaitMs?: number;
  /** Called on every poll with the current task state. */
  onProgress?: (state: SeedanceTaskState) => void;
}

// ─── Internal helpers ───────────────────────────────────────

/**
 * Polling cadence: short polls early (videos finish in 30–60 s typically),
 * back off after a minute. Total wait is bounded by maxWaitMs separately.
 */
function nextPollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 5_000;
  if (elapsedMs < 90_000) return 10_000;
  if (elapsedMs < 240_000) return 20_000;
  return 30_000;
}

function isTerminal(status: SeedanceTaskStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Normalize ARK task responses into our internal shape.
 *
 * ARK returns the result video URL at `content.video_url` when status is
 * "succeeded". Earlier task states omit it. Status strings are normalized
 * to lowercase to absorb upstream casing changes.
 */
function parseTaskState(taskId: string, payload: unknown): SeedanceTaskState {
  const obj = (payload ?? {}) as Record<string, unknown>;
  const rawStatus = String(obj.status ?? "").toLowerCase();

  let status: SeedanceTaskStatus;
  switch (rawStatus) {
    case "succeeded":
    case "success":
      status = "succeeded";
      break;
    case "failed":
    case "error":
      status = "failed";
      break;
    case "cancelled":
    case "canceled":
      status = "cancelled";
      break;
    case "running":
    case "processing":
      status = "running";
      break;
    case "queued":
    case "pending":
    default:
      status = "queued";
      break;
  }

  const content = (obj.content ?? {}) as Record<string, unknown>;
  const videoUrl =
    typeof content.video_url === "string" ? content.video_url : undefined;

  const errorObj = obj.error as Record<string, unknown> | undefined;
  const errorMessage =
    status === "failed"
      ? typeof errorObj?.message === "string"
        ? errorObj.message
        : "Seedance task failed"
      : undefined;

  const progressRaw = obj.progress;
  const progressPercent =
    typeof progressRaw === "number" ? progressRaw : undefined;

  return {
    taskId,
    status,
    videoUrl,
    errorMessage,
    progressPercent,
    raw: obj,
  };
}

// ─── Provider class ────────────────────────────────────────

export class SeedanceProvider {
  readonly name = "seedance";
  readonly displayName = "ByteDance Seedance 2.0";

  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.SEEDANCE_BASE_URL.replace(/\/$/, "");
  }

  /**
   * Resolve the API key per-request: DB-stored credential first, env fallback.
   * Matches the pattern OpenAI / Ideogram / Gemini providers use so admin
   * key updates take effect without restarting the worker.
   */
  private async getApiKey(): Promise<string> {
    return credentialService.getCredentialOrEnv("seedance_api_key");
  }

  /**
   * Sync probe used by callers that need to bail out early without awaiting.
   * Mirrors the env-only check the other providers do — once a key is set
   * either in env or in the DB cache, the per-request {@link getApiKey} is
   * authoritative.
   */
  isConfigured(): boolean {
    return Boolean(config.SEEDANCE_API_KEY);
  }

  /**
   * Submit a single video generation task. Returns task_id; the caller polls.
   */
  async submitTask(input: SeedanceSubmitInput): Promise<SeedanceSubmitResult> {
    // Seedance's `content` array carries one text block plus 0..N image_url
    // blocks. BytePlus ARK supports three mutually exclusive image modes,
    // and rejects requests that mix them with:
    //   "first/last frame content cannot be mixed with reference media content"
    //
    //   Mode A (image-to-video):    exactly 1 image, role="first_frame"
    //   Mode B (first-last-frame):  2 images, role="first_frame" + "last_frame"
    //   Mode C (omni-reference):    N images, all role="reference_image"
    //
    // We auto-pick by count — 1 image → first_frame (Mode A), 2+ → all
    // reference_image (Mode C). Mode B is unused; pipeline continuation clips
    // pass only the extracted last frame and land in Mode A. Every image
    // gets an explicit role so we never trip the API's "role must be
    // specified for image contents" guard, and we never produce the
    // forbidden Mode-A+C mix.
    const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
    const useReferenceMode = imageUrls.length >= 2;
    const generateAudio = input.generateAudio ?? true;
    const body = {
      model: input.modelId,
      content: [
        { type: "text", text: input.prompt },
        ...imageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
          role: useReferenceMode ? "reference_image" : "first_frame",
        })),
      ],
      duration: input.durationSec,
      resolution: input.resolution,
      // For text-to-video the input image's aspect doesn't exist, so adaptive
      // is undefined — fall back to 16:9 which is the most common video shape.
      ratio: input.ratio ?? (imageUrls.length > 0 ? "adaptive" : "16:9"),
      watermark: input.watermark ?? false,
      // Seedance 2.0 omits audio by default — opt in explicitly. Setting this
      // false (e.g., for storyboard-only renders) saves a small amount of
      // generation time.
      generate_audio: generateAudio,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };

    const response = await this.request(
      "POST",
      "/contents/generations/tasks",
      body,
      input.signal
    );

    const taskId =
      typeof (response as { id?: unknown }).id === "string"
        ? ((response as { id: string }).id)
        : undefined;

    if (!taskId) {
      throw new ServiceUnavailableError(
        "Seedance submit returned no task id"
      );
    }

    logger.info(
      {
        taskId,
        modelId: input.modelId,
        durationSec: input.durationSec,
        resolution: input.resolution,
        imageCount: imageUrls.length,
        mode:
          imageUrls.length === 0
            ? "text-to-video"
            : useReferenceMode
              ? "omni-reference"
              : "image-to-video",
      },
      "Seedance task submitted"
    );

    return { taskId };
  }

  /**
   * Fetch current state of a single task.
   */
  async getTask(
    taskId: string,
    signal?: AbortSignal
  ): Promise<SeedanceTaskState> {
    const payload = await this.request(
      "GET",
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      undefined,
      signal
    );
    return parseTaskState(taskId, payload);
  }

  /**
   * Best-effort cancel. Used when a job is aborted mid-flight so we don't
   * keep paying for compute we'll discard. Errors are logged, not thrown.
   */
  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.request(
        "DELETE",
        `/contents/generations/tasks/${encodeURIComponent(taskId)}`
      );
      logger.info({ taskId }, "Seedance task cancelled");
    } catch (err) {
      logger.warn({ taskId, err }, "Seedance cancel failed (non-fatal)");
    }
  }

  /**
   * Submit a task and poll until it reaches a terminal state.
   *
   * Throws on:
   *   - failed/cancelled task
   *   - timeout (maxWaitMs exceeded)
   *   - aborted signal (also cancels the upstream task)
   */
  async submitAndAwait(
    input: SeedanceSubmitInput,
    options: SeedanceAwaitOptions = {}
  ): Promise<{ videoUrl: string; taskId: string; finalState: SeedanceTaskState }> {
    const { taskId } = await this.submitTask(input);
    const finalState = await this.awaitTask(taskId, {
      ...options,
      signal: input.signal,
    });

    if (finalState.status !== "succeeded" || !finalState.videoUrl) {
      throw new ServiceUnavailableError(
        finalState.errorMessage ??
          `Seedance task ${taskId} ended in status '${finalState.status}'`
      );
    }

    return { videoUrl: finalState.videoUrl, taskId, finalState };
  }

  /**
   * Poll an existing task until terminal. Used internally by submitAndAwait
   * but exposed for callers that submit and poll separately.
   */
  async awaitTask(
    taskId: string,
    options: SeedanceAwaitOptions & { signal?: AbortSignal } = {}
  ): Promise<SeedanceTaskState> {
    const maxWaitMs = options.maxWaitMs ?? config.SEEDANCE_POLL_MAX_WAIT_MS;
    const startedAt = Date.now();
    const { signal, onProgress } = options;

    let attempt = 0;
    while (true) {
      attempt += 1;
      const state = await this.getTask(taskId, signal);

      if (onProgress) {
        try {
          onProgress(state);
        } catch (err) {
          logger.warn({ err, taskId }, "Seedance onProgress callback threw");
        }
      }

      if (isTerminal(state.status)) {
        logger.info(
          {
            taskId,
            status: state.status,
            attempts: attempt,
            elapsedMs: Date.now() - startedAt,
          },
          "Seedance task reached terminal state"
        );
        return state;
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= maxWaitMs) {
        // Best-effort cancel so we don't pay for compute we won't use
        void this.cancelTask(taskId);
        throw new ServiceUnavailableError(
          `Seedance task ${taskId} did not complete within ${Math.round(maxWaitMs / 1000)}s`
        );
      }

      // Don't sleep past the deadline
      const remainingMs = maxWaitMs - elapsedMs;
      const delayMs = Math.min(nextPollDelayMs(elapsedMs), remainingMs);

      try {
        await sleep(delayMs, signal);
      } catch {
        // Aborted — cancel upstream task and bail
        void this.cancelTask(taskId);
        throw new ServiceUnavailableError(
          `Seedance task ${taskId} was aborted by the caller`
        );
      }
    }
  }

  // ─── HTTP plumbing ─────────────────────────────────────

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableError(
        "Seedance video provider is not configured (set SEEDANCE_API_KEY in env or via admin)"
      );
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      // Network error / abort
      if ((err as { name?: string })?.name === "AbortError") {
        throw new ServiceUnavailableError("Seedance request was aborted");
      }
      throw new ServiceUnavailableError(
        `Seedance network error: ${(err as Error).message}`
      );
    }

    // ARK uses standard HTTP status codes; map errors to typed app errors.
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      const errBlock = (parsed?.error ?? parsed) as
        | Record<string, unknown>
        | null;
      const code = String(errBlock?.code ?? "");
      const message = String(
        errBlock?.message ?? text ?? `HTTP ${response.status}`
      );

      // Content moderation (ARK code "ContentSafety...") → ModerationError
      if (response.status === 400 && /content.?safety|moderation|sensitive/i.test(code + message)) {
        throw new ModerationError(message);
      }
      if (response.status === 400) {
        throw new BadRequestError(`Seedance bad request: ${message}`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableError(
          `Seedance auth failed (HTTP ${response.status}): check SEEDANCE_API_KEY`
        );
      }
      if (response.status === 404 && method === "GET") {
        throw new ServiceUnavailableError(`Seedance task not found`);
      }
      // 429 / 5xx / anything else — treat as transient/upstream
      throw new ServiceUnavailableError(
        `Seedance upstream error (HTTP ${response.status}): ${message}`
      );
    }

    if (response.status === 204) return null;
    return response.json();
  }
}

// Singleton — provider is stateless aside from config
export const seedanceProvider = new SeedanceProvider();
