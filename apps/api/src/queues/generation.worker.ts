import { Worker, type Job } from "bullmq";
import { getRedis } from "../config/redis.js";
import { config } from "../config/index.js";
import { executePipeline } from "../engine/pipeline.js";
import { loadAllFonts } from "../engine/fonts/index.js";
import { logger } from "../utils/logger.js";
import { QUEUE_NAME, type GenerationJobData } from "./generation.queue.js";

let workerInstance: Worker | null = null;

/**
 * Create and start the generation worker.
 *
 * Processes generation jobs from the BullMQ queue.
 * Each job runs the full pipeline: load -> render -> upload -> update.
 *
 * Configuration:
 * - Concurrency: from WORKER_CONCURRENCY env var (default 3)
 * - Memory: capped via --max-old-space-size in worker:prod script
 * - GC: hinted after each job via global.gc() if --expose-gc is set
 */
export function startGenerationWorker(): Worker {
  if (workerInstance) return workerInstance;

  // Pre-load fonts on worker startup
  loadAllFonts();

  workerInstance = new Worker(
    QUEUE_NAME,
    async (job: Job<GenerationJobData>) => {
      const { generationId, qualityTier, userId } = job.data;

      logger.info(
        { jobId: job.id, generationId, qualityTier, userId, attempt: job.attemptsMade + 1 },
        "Processing generation job"
      );

      const result = await executePipeline({ generationId });

      if (result.status === "FAILED") {
        throw new Error(result.errorMessage ?? "Pipeline failed");
      }

      // Hint GC after job completion to free image buffers
      if (typeof globalThis.gc === "function") {
        globalThis.gc();
      }

      return result;
    },
    {
      connection: getRedis(),
      concurrency: config.WORKER_CONCURRENCY,
      limiter: {
        max: 10,
        duration: 60_000, // 10 jobs per minute
      },
    }
  );

  // Worker event handlers
  workerInstance.on("completed", (job) => {
    logger.info(
      { jobId: job?.id, generationId: job?.data?.generationId },
      "Generation job completed"
    );
  });

  workerInstance.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        generationId: job?.data?.generationId,
        attempt: job?.attemptsMade,
        error: error.message,
      },
      "Generation job failed"
    );
  });

  workerInstance.on("error", (error) => {
    logger.error({ error }, "Worker error");
  });

  workerInstance.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Generation job stalled");
  });

  logger.info(
    { concurrency: config.WORKER_CONCURRENCY },
    "Generation worker started"
  );

  return workerInstance;
}

/**
 * Gracefully stop the worker.
 */
export async function stopGenerationWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info("Generation worker stopped");
  }
}
