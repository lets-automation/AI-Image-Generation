import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { subscriptionController } from "../controllers/subscription.controller.js";
import { razorpayController } from "../controllers/razorpay.controller.js";

const router = Router();

// All subscription routes require authentication
router.use(authenticate);

// POST /api/v1/subscriptions/verify — Verify purchase after StoreKit transaction
router.post("/verify", (req, res, next) =>
  subscriptionController.verify(req, res, next)
);

// GET /api/v1/subscriptions/status — Get active subscription + balance
router.get("/status", (req, res, next) =>
  subscriptionController.status(req, res, next)
);

// POST /api/v1/subscriptions/restore — Restore after reinstall
router.post("/restore", (req, res, next) =>
  subscriptionController.restore(req, res, next)
);

// GET /api/v1/subscriptions/plans — List available plans (pricing display)
router.get("/plans", (req, res, next) =>
  subscriptionController.plans(req, res, next)
);

// Razorpay (Web)

// POST /api/v1/subscriptions/razorpay/create-order — Create Razorpay order
router.post("/razorpay/create-order", (req, res, next) =>
  razorpayController.createOrder(req, res, next)
);

// POST /api/v1/subscriptions/razorpay/verify — Verify Razorpay payment & activate
router.post("/razorpay/verify", (req, res, next) =>
  razorpayController.verifyPayment(req, res, next)
);

export { router as subscriptionRoutes };
