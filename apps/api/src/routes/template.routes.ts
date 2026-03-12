import { Router } from "express";
import { templateController } from "../controllers/template.controller.js";
import { validate } from "../middleware/validation.js";
import { authenticate } from "../middleware/auth.js";
import { templateListQuery, templateGroupedQuery } from "@ep/shared";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  validate({ query: templateListQuery }),
  templateController.list.bind(templateController)
);

router.get(
  "/grouped",
  validate({ query: templateGroupedQuery }),
  templateController.listGrouped.bind(templateController)
);

router.get(
  "/:id",
  templateController.getById.bind(templateController)
);

export { router as templateRoutes };
