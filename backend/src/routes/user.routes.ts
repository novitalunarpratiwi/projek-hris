import { Router } from "express";
import { Role } from "@prisma/client";
import * as userController from "../controllers/user.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware"; 
import upload from "../middlewares/upload.middleware"; 

const router = Router();

// Semua rute di bawah ini wajib login
router.use(authenticate);

/**
 * ==========================================
 * 1. SELF SERVICE ROUTES (Karyawan/Admin Edit Profil Sendiri)
 * ==========================================
 */
// Jika profil dan foto diupdate bersamaan
router.patch("/profile", upload.single("profile_image"), userController.updateProfile); 
router.patch("/password", userController.changePassword);
// Khusus upload foto saja
router.post("/photo", upload.single("profile_image"), userController.uploadProfileImage);


/**
 * ==========================================
 * 2. ADMIN MANAGEMENT ROUTES (Kelola Karyawan Lain)
 * ==========================================
 */
const adminAccess = authorizeRoles(Role.admin, Role.superadmin);

router.get("/", adminAccess, userController.getAllUsers); 
router.get("/detail/:id", adminAccess, userController.getUserById); 

/**
 * PENTING: upload.single("profile_image") diletakkan sebelum checkSubscription
 * agar req.body terisi dan bisa divalidasi oleh middleware selanjutnya.
 */

// Create User: Wajib cek kuota subscription
router.post(
  "/", 
  adminAccess, 
  upload.single("profile_image"), // Parse data multipart dulu
  checkSubscription,              // Baru cek kuota (jika butuh baca req.body)
  userController.createUser
);

router.patch(
  "/update/:id", 
  adminAccess, 
  upload.single("profile_image"), // WAJIB ADA agar req.body tidak undefined
  checkSubscription, 
  userController.updateUser
);

// Rute manajemen status & hapus
router.patch("/status/:id", adminAccess, checkSubscription, userController.updateUserStatus);
router.delete("/delete/:id", adminAccess, checkSubscription, userController.deleteUser);

// Reset Password oleh Admin
router.patch("/reset-password/:id", adminAccess, userController.adminResetPassword);

export default router;