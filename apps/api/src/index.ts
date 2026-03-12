import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/index.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRoutes } from "./routes/index.js";
import { initCloudinary } from "./config/cloudinary.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";

const app = express();

// ─── Security ───────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    exposedHeaders: [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
    ],
    maxAge: 600, // Cache preflight for 10 minutes
  })
);

// ─── Body Parsing ───────────────────────────────────────
// Razorpay webhook needs raw body for signature verification
import { handleRazorpayWebhook } from "./controllers/razorpay.controller.js";
app.post(
  "/api/v1/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // Convert raw buffer to string and store as rawBody
    (req as any).rawBody = req.body.toString("utf-8");
    req.body = JSON.parse((req as any).rawBody);
    handleRazorpayWebhook(req, res);
  }
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Logging ────────────────────────────────────────────
app.use(requestLogger);

// ─── Rate Limiting ──────────────────────────────────────
app.use(globalLimiter);

// ─── Init External Services ─────────────────────────────
initCloudinary();

// ─── API Documentation ──────────────────────────────────
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "EP-Product API Docs",
  customCss: ".swagger-ui .topbar { display: none }",
}));
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ─── Routes ─────────────────────────────────────────────
app.use("/api/v1", apiRoutes);

// ─── Error Handling ─────────────────────────────────────
app.use(errorHandler);

export { app };
