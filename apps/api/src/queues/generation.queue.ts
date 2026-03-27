import { Queue } from "bullmq";
import { getRedis } from "../config/redis.js";
import { TIER_CONFIGS, type QualityTier } from "@ep/shared";
import { logger } from "../utils/logger.js";

const QUEUE_NAME = "generation";

let queueInstance: Queue | null = null;

/**
 * Get the generation queue singleton.
 * Uses the shared Redis connection with BullMQ-required settings.
 */
export function getGenerationQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: {
          count: 1000, // Keep last 1000 completed jobs
          age: 24 * 3600, // Max 24 hours
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs
          age: 7 * 24 * 3600, // Max 7 days
        },
      },
    });

    logger.info("Generation queue initialized");
  }

  return queueInstance;
}

export interface GenerationJobData {
  generationId: string;
  qualityTier: QualityTier;
  userId: string;
}

/**
 * Add a generation job to the queue.
 *
 * @param data - Job data including generationId and tier
 * @returns The BullMQ job ID
 */
export async function enqueueGeneration(
  data: GenerationJobData
): Promise<string> {
  const queue = getGenerationQueue();
  const jobTimeout = TIER_CONFIGS[data.qualityTier].jobTimeoutMs;

  const job = await queue.add("render", data, {
    jobId: `gen-${data.generationId}`,
    // BullMQ uses lower numbers as higher priority.
    // PREMIUM should be processed first, then STANDARD, then BASIC.
    priority: data.qualityTier === "PREMIUM" ? 1 : data.qualityTier === "STANDARD" ? 2 : 3,
    // Store timeout in custom metadata — worker enforces it via AbortController
  } as Record<string, unknown>);

  logger.info(
    { generationId: data.generationId, jobId: job.id, tier: data.qualityTier, timeout: jobTimeout },
    "Generation job enqueued"
  );

  return job.id!;
}

/**
 * Get queue health metrics.
 */
export async function getQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getGenerationQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

export { QUEUE_NAME };
