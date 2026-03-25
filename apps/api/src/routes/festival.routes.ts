import { Router } from "express";
import { festivalController } from "../controllers/festival.controller.js";
import { optionalAuth } from "../middleware/auth.js";

const router = Router();

router.use(optionalAuth);

router.get(
  "/upcoming",
  festivalController.getUpcoming.bind(festivalController)
);

router.get(
  "/:id",
  festivalController.getById.bind(festivalController)
);

export { router as festivalRoutes };
