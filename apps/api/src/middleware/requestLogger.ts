import pinoHttp from "pino-http";
import { logger } from "../utils/logger.js";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      // Skip health check logs
      return req.url === "/health" || req.url === "/api/v1/health";
    },
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
});
