import { Router } from "express";
import * as leaveController from "../controllers/leave.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware"; 
import { checkSubscription } from "../middlewares/subscription.middleware"; // Middleware baru
import upload from "../middlewares/upload.middleware"; 

const router = Router();

// --- PROTEKSI SEMUA RUTE ---
router.use(authenticate);

/*** AKSES: EMPLOYEE & ADMIN ***/
router.get("/", leaveController.getLeaves);
router.get("/detail/:id", leaveController.getLeaveDetail);

/*** AKSES: KHUSUS EMPLOYEE ***/
router.get("/my-quota", leaveController.getLeaveQuota);

// Tambahkan checkSubscription di sini agar karyawan perusahaan expired tidak bisa kirim pengajuan
router.post("/request", authenticate, checkSubscription, upload.single("evidence"), leaveController.requestLeave
);router.delete("/cancel/:id", checkSubscription, leaveController.cancelLeave);

/*** AKSES: KHUSUS ADMIN PERUSAHAAN ***/
// Tambahkan checkSubscription agar admin perusahaan expired tidak bisa approve cuti
router.patch("/review/:id", authorizeRoles("admin"), checkSubscription, leaveController.reviewLeave);
router.get("/active-today", authorizeRoles("admin"), leaveController.getActiveLeavesToday);
router.get("/stats/summary", authorizeRoles("admin"), leaveController.getLeaveStats);

/*** AKSES: KHUSUS SUPERADMIN ***/
router.get("/system/all-logs", authorizeRoles("superadmin"), leaveController.getSystemWideLeaves);

export default router;