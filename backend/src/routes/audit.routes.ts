import { Router } from "express";
import { Role } from "@prisma/client";
import * as auditController from "../controllers/audit.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Semua rute wajib login
router.use(authenticate);

/**
 * 1. LOG GLOBAL (Khusus Superadmin)
 * Melihat jejak aktivitas seluruh sistem dan semua tenant.
 */
router.get("/global", authorizeRoles(Role.superadmin), auditController.getGlobalAuditLogs);

/**
 * 2. LOG INTERNAL (Admin Perusahaan)
 * Melihat aktivitas hanya di dalam perusahaannya sendiri.
 */
router.get("/company", authorizeRoles(Role.admin), auditController.getCompanyAuditLogs);

export default router;