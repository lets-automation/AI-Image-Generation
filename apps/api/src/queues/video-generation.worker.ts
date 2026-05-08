/**
 * Video generation worker.
 *
 * Pulls jobs from the video-generation queue and runs the video pipeline.
 *
 * Concurrency is intentionally low (default 2) — each job:
 *   - Holds 30–100 MB of clip buffers in memory while stitching
 *   - Spawns ffmpeg as a child process
 *   - Can run for 5+ minutes upstream
 *
 * Limiter caps starts to avoid hammering Seedance with bursts.
 */

import { UnrecoverableError, Worker, type Job } from "bullmq";
import { getRedis } from "../config/redis.js";
import { config } from "../config/index.js";
import { executeVideoPipeline } from "../engine/video-pipeline.js";
import { logger } from "../utils/logger.js";
import {
  VIDEO_QUEUE_NAME,
  type VideoGenerationJobData,
} from "./video-generation.queue.js";

let workerInstance: Worker | null = null;

/**
 * Allow the video worker concurrency to be tuned independently of the image
 * worker. Defaults to half of WORKER_CONCURRENCY (rounded up, min 1) since
 * each video job is much heavier per slot than an image job.
 */
function resolveVideoConcurrency(): number {
  const raw = process.env.VIDEO_WORKER_CONCURRENCY;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Math.max(1, Math.ceil(config.WORKER_CONCURRENCY / 2));
}

export function startVideoGenerationWorker(): Worker {
  if (workerInstance) return workerInstance;

  const concurrency = resolveVideoConcurrency();

  workerInstance = new Worker(
    VIDEO_QUEUE_NAME,
    async (job: Job<VideoGenerationJobData>) => {
      const { generationId, qualityTier, durationSec, userId } = job.data;

      logger.info(
        {
          jobId: job.id,
          generationId,
          qualityTier,
          durationSec,
          userId,
          attempt: job.attemptsMade + 1,
        },
        "Processing video generation job"
      );

      const result = await executeVideoPipeline({ generationId });

      if (result.status === "FAILED") {
        const message = result.errorMessage ?? "Video pipeline failed";
        // Skip retries when the failure is permanent (content moderation,
        // validation, missing credits, etc.) — re-running would just hit the
        // same upstream rejection and burn another worker slot.
        if (result.nonRetryable) {
          throw new UnrecoverableError(message);
        }
        throw new Error(message);
      }

      // Free the in-process clip buffers proactively
      if (typeof globalThis.gc === "function") {
        globalThis.gc();
      }

      return result;
    },
    {
      connection: getRedis(),
      concurrency,
      // Cap submissions to Seedance — cost guard handles spend, this is just
      // a safety valve against runaway enqueueing.
      limiter: { max: 5, duration: 60_000 },
    }
  );

  workerInstance.on("completed", (job) => {
    logger.info(
      { jobId: job?.id, generationId: job?.data?.generationId },
      "Video generation job completed"
    );
  });

  workerInstance.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        generationId: job?.data?.generationId,
        attempt: job?.attemptsMade ?? 0,
        maxAttempts: job?.opts?.attempts ?? 2,
        error: error.message,
      },
      "Video generation job failed"
    );
    // Refunds are owned by the pipeline — keep this handler non-mutating.
  });

  workerInstance.on("error", (error) => {
    logger.error({ error }, "Video worker error");
  });

  workerInstance.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Video generation job stalled");
  });

  logger.info({ concurrency }, "Video generation worker started");

  return workerInstance;
}

export async function stopVideoGenerationWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info("Video generation worker stopped");
  }
}
