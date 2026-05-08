import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/api-client";

export interface StreamedStatus {
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";
  progress?: number;
  resultImageUrl?: string | null;
  resultVideoUrl?: string | null;
  errorMessage?: string | null;
  step?: string;
  jobType?: "IMAGE" | "VIDEO";
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"]);

/**
 * Subscribe to a generation's status stream.
 *
 * Uses fetch + ReadableStream (not EventSource) so we can attach the
 * Authorization header that the SSE endpoint requires. Falls back to
 * short-interval polling on stream errors. Stops automatically when the
 * status reaches a terminal value.
 *
 * Reused by both the image and video flows since the backend publishes both
 * to the same `generation:${id}:status` channel.
 */
export function useGenerationStatus(generationId: string | null): {
  status: StreamedStatus | null;
  error: string | null;
} {
  const [status, setStatus] = useState<StreamedStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generationId) return;

    let cancelled = false;
    const controller = new AbortController();

    function apply(update: StreamedStatus) {
      if (cancelled) return;
      setStatus(update);
    }

    async function streamSSE() {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${API_BASE_URL}/generations/${generationId}/status`,
          { headers, signal: controller.signal }
        );
        if (!response.ok || !response.body) {
          throw new Error(`Status stream failed (HTTP ${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const update = JSON.parse(dataLine.slice(5).trim()) as StreamedStatus;
              apply(update);
              if (TERMINAL.has(update.status)) {
                controller.abort();
                return;
              }
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || cancelled) return;
        // SSE failed mid-flight — fall back to polling so the user still
        // sees the final state when the job completes.
        await pollFallback();
      }
    }

    async function pollFallback() {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        // Cap fallback polling at 11 minutes — matches the SSE timeout window.
        const start = Date.now();
        while (!cancelled && Date.now() - start < 11 * 60_000) {
          const res = await fetch(`${API_BASE_URL}/generations/${generationId}`, {
            headers,
          });
          if (res.ok) {
            const json = (await res.json()) as {
              data?: {
                status: StreamedStatus["status"];
                resultImageUrl?: string | null;
                resultVideoUrl?: string | null;
                errorMessage?: string | null;
              };
            };
            const item = json.data;
            if (item) {
              apply({
                status: item.status,
                resultImageUrl: item.resultImageUrl,
                resultVideoUrl: item.resultVideoUrl,
                errorMessage: item.errorMessage,
              });
              if (TERMINAL.has(item.status)) return;
            }
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? "Failed to load status");
        }
      }
    }

    void streamSSE();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [generationId]);

  return { status, error };
}
