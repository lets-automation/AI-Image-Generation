import { app } from "./index.js";
import { config } from "./config/index.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { disconnectRedis } from "./config/redis.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info("Database connected");

    // Start server
    const server = app.listen(config.API_PORT, () => {
      logger.info(`API server running on port ${config.API_PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);

      server.close(async () => {
        logger.info("HTTP server closed");
        await disconnectDatabase();
        await disconnectRedis();
        logger.info("All connections closed");
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 30_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
}

main();
