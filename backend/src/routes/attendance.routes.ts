import { Router } from "express";
import * as attendanceController from "../controllers/attendance.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware";
import { Role } from "@prisma/client";
import upload from "../middlewares/upload.middleware";

const router = Router();

/**
 * 1. RUTE KARYAWAN (Personal Access)
 */
router.get("/today", authenticate, attendanceController.getTodayAttendance);
router.get("/my-history", authenticate, attendanceController.getMyAttendance);
router.post("/check", 
    authenticate, 
    checkSubscription, 
    upload.single("attendance_photo"), // Ubah di sini
    attendanceController.addCheckClock
);
/**
 * 2. RUTE MANAJEMEN (Admin & Superadmin Only)
 */
router.get("/all", 
    authenticate, 
    authorizeRoles(Role.admin, Role.superadmin), 
    attendanceController.getAllAttendance
);

router.get("/user/:userId", 
    authenticate, 
    authorizeRoles(Role.admin, Role.superadmin), 
    attendanceController.getAttendanceByUser
);
router.patch("/update/:id", 
    authenticate, 
    authorizeRoles(Role.admin, Role.superadmin), 
    checkSubscription, 
    attendanceController.updateAttendanceManual
);
router.get("/report", 
    authenticate, 
    authorizeRoles(Role.admin, Role.superadmin), 
    attendanceController.getAttendanceReport
);
router.post("/bulk-update", 
    authenticate, 
    authorizeRoles(Role.admin, Role.superadmin), 
    checkSubscription, 
    attendanceController.bulkUpdateAttendance
);

/**
 * 3. KONFIGURASI & SETTINGS (Admin Only)
 */
router.get("/office-data", 
    authenticate, 
    authorizeRoles(Role.admin), 
    attendanceController.getOfficeData
);
router.put("/settings/office", 
    authenticate, 
    authorizeRoles(Role.admin), 
    checkSubscription, 
    attendanceController.updateOfficeSettings
);
router.put("/settings/time", 
    authenticate, 
    authorizeRoles(Role.admin), 
    checkSubscription, 
    attendanceController.updateAttendanceTimeSettings
);

export default router;