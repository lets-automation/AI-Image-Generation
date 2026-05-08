/**
 * Video generation queue.
 *
 * Separate from the image generation queue so long-running video jobs
 * (3–10 min upstream + ffmpeg + upload) don't starve fast image jobs
 * (typically 10–30 s). The two queues share the Redis connection but have
 * independent worker concurrency budgets.
 */

import { Queue } from "bullmq";
import { getRedis } from "../config/redis.js";
import { VIDEO_JOB_TIMEOUT_MS, type QualityTier, type VideoDuration } from "@ep/shared";
import { logger } from "../utils/logger.js";

const QUEUE_NAME = "video-generation";

let queueInstance: Queue | null = null;

export function getVideoGenerationQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        // Video jobs are expensive — fewer retries to avoid burning cost on
        // structurally-broken inputs. Each retry triggers another full Seedance
        // submission cycle.
        attempts: 2,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { count: 500, age: 24 * 3600 },
        removeOnFail: { count: 250, age: 7 * 24 * 3600 },
      },
    });

    logger.info("Video generation queue initialized");
  }

  return queueInstance;
}

export interface VideoGenerationJobData {
  generationId: string;
  qualityTier: QualityTier;
  durationSec: VideoDuration;
  userId: string;
}

/**
 * Add a video generation job to the queue. Returns the BullMQ job id.
 *
 * The hard timeout for the pipeline is enforced inside the worker via
 * AbortController (not by BullMQ) — see {@link VIDEO_JOB_TIMEOUT_MS}.
 */
export async function enqueueVideoGeneration(
  data: VideoGenerationJobData
): Promise<string> {
  const queue = getVideoGenerationQueue();

  const job = await queue.add("render-video", data, {
    jobId: `vid-${data.generationId}`,
    // Same priority semantics as image queue: lower number = higher priority.
    priority:
      data.qualityTier === "PREMIUM" ? 1 : data.qualityTier === "STANDARD" ? 2 : 3,
  });

  logger.info(
    {
      generationId: data.generationId,
      jobId: job.id,
      tier: data.qualityTier,
      durationSec: data.durationSec,
      timeoutMs: VIDEO_JOB_TIMEOUT_MS,
    },
    "Video generation job enqueued"
  );

  return job.id!;
}

export async function getVideoQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getVideoGenerationQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

export { QUEUE_NAME as VIDEO_QUEUE_NAME };
