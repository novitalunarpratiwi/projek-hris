// src/routes/position.routes.ts
import { Router } from "express";
import * as posController from "../controllers/position.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { Role } from "@prisma/client";

const router = Router();

router.use(authenticate);
router.get("/", authorizeRoles(Role.admin), posController.getAllPositions);
router.get("/:id", authorizeRoles(Role.admin), posController.getPositionById);
router.post("/", authorizeRoles(Role.admin), posController.createPosition);
router.put("/:id", authorizeRoles(Role.admin), posController.updatePosition);
router.delete("/:id", authorizeRoles(Role.admin), posController.deletePosition);
router.get("/me/detail", posController.getMyPositionDetail);

export default router;