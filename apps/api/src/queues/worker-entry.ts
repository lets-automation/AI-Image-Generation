/**
 * Worker Entry Point
 *
 * Standalone process for running the BullMQ generation worker.
 * Run with: tsx src/queues/worker-entry.ts (dev)
 * Or: node --max-old-space-size=512 --expose-gc dist/queues/worker-entry.js (prod)
 */

// CRITICAL: Load .env before anything else — this is a standalone process,
// so it does NOT inherit env from the API server.
import "dotenv/config";

import { config } from "../config/index.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { disconnectRedis } from "../config/redis.js";
import { initCloudinary } from "../config/cloudinary.js";
import { startGenerationWorker, stopGenerationWorker } from "./generation.worker.js";
import { scheduleReconciliation, startReconciliationWorker } from "./subscription-reconciliation.js";
import type { Worker } from "bullmq";
import { logger } from "../utils/logger.js";

async function main() {
  logger.info(
    { env: config.NODE_ENV, concurrency: config.WORKER_CONCURRENCY },
    "Starting generation worker process"
  );

  // Connect to database
  await connectDatabase();
  logger.info("Database connected");

  // Initialize Cloudinary (required for uploading generated images)
  initCloudinary();

  // Start workers
  startGenerationWorker();

  // Start reconciliation worker + schedule daily job
  let reconciliationWorker: Worker | null = null;
  try {
    reconciliationWorker = startReconciliationWorker();
    await scheduleReconciliation();
  } catch (err) {
    logger.error({ err }, "Failed to start reconciliation worker — continuing without it");
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received, stopping worker...");

    try {
      await stopGenerationWorker();
      if (reconciliationWorker) {
        await reconciliationWorker.close();
      }
      await disconnectDatabase();
      await disconnectRedis();
      logger.info("Worker shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during worker shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Log memory usage periodically
  setInterval(() => {
    const mem = process.memoryUsage();
    logger.debug(
      {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      },
      "Worker memory usage"
    );
  }, 60_000);
}

main().catch((err) => {
  logger.fatal({ err }, "Worker startup failed");
  process.exit(1);
});
