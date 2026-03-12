import { Router } from "express";
import { categoryController } from "../controllers/category.controller.js";
import { validate } from "../middleware/validation.js";
import { authenticate } from "../middleware/auth.js";
import { categoryListQuery } from "@ep/shared";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  validate({ query: categoryListQuery }),
  categoryController.list.bind(categoryController)
);

router.get(
  "/:id",
  categoryController.getById.bind(categoryController)
);

router.get(
  "/:id/fields",
  categoryController.getFields.bind(categoryController)
);

export { router as categoryRoutes };
