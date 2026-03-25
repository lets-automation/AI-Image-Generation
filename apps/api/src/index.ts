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
import { swaggerSpec } from "./config/swagger.js";

const app = express();

// ─── Trust Proxy (required behind Nginx/reverse proxy for rate limiting) ───
app.set("trust proxy", 1);

// ─── API Documentation (before helmet so CSP doesn't block CDN) ───
app.get("/api/v1/docs", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>EP-Product API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/v1/docs.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  </script>
</body>
</html>`);
});
app.get("/api/v1/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

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

// ─── Routes ─────────────────────────────────────────────
app.use("/api/v1", apiRoutes);

// ─── Error Handling ─────────────────────────────────────
app.use(errorHandler);

export { app };
