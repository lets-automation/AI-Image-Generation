import IORedis from "ioredis";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

let redisInstance: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    redisInstance.on("connect", () => {
      logger.info("Redis connected");
    });

    redisInstance.on("error", (err) => {
      logger.error({ err }, "Redis connection error");
    });
  }

  return redisInstance;
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
