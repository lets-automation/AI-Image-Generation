import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
