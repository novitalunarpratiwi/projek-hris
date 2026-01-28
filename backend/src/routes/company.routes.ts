import { Router } from "express";
import * as companyController from "../controllers/company.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { Role } from "@prisma/client";
import upload from "../middlewares/upload.middleware";

const router = Router();

// Semua rute wajib login
router.use(authenticate);

/**
 * 1. AKSES SEMUA ROLE (Profil untuk Karyawan)
 */
router.get("/profile", companyController.getCompanyProfile);

/**
 * 2. AKSES KHUSUS ADMIN (Manajemen Identitas)
 */
const adminOnly = authorizeRoles(Role.admin);

router.patch("/update", adminOnly, companyController.updateCompany);
router.post("/logo", adminOnly, upload.single("logo"), companyController.uploadLogo);

export default router;