import { Router } from "express";
import { body } from "express-validator";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";

const router = Router();

/**
 * 1. SETUP SUPERADMIN (Initial Deployment)
 */
router.post("/setup-superadmin", [
    body("name").trim().notEmpty().withMessage("Nama wajib diisi"),
    body("email")
        .isEmail().withMessage("Email tidak valid")
        .custom((value) => {
            if (!value.endsWith("@supersuper")) {
                throw new Error("Email Superadmin harus berakhiran @supersuper");
            }
            return true;
        })
        .normalizeEmail(),
    body("password").notEmpty().withMessage("Password sistem wajib diisi")
], validate, authController.createInitialSuperadmin);

/**
 * 2. REGISTER TENANT (SaaS Registration)
 */
router.post("/register", [
    body("name").trim().notEmpty().withMessage("Nama admin wajib diisi"),
    body("email").isEmail().withMessage("Email tidak valid").normalizeEmail(),
    body("companyName").trim().notEmpty().withMessage("Nama perusahaan wajib diisi"),
    body("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter")
], validate, authController.register);

/**
 * 3. LOGIN & SSO
 */
router.post("/login", [
    body("email")
        // Izinkan domain tanpa titik untuk keperluan testing/internal
        .isEmail({ allow_display_name: false, require_tld: false }) 
        .withMessage("Email tidak valid")
        .normalizeEmail(),
    body("password").notEmpty().withMessage("Password wajib diisi")
], validate, authController.login);

router.post("/google", [
    body("email").isEmail().withMessage("Email Google wajib dikirim")
], validate, authController.googleLogin);

/**
 * 4. PASSWORD MANAGEMENT
 */
router.post("/forgot-password", [
    body("email").isEmail().withMessage("Email tidak valid").normalizeEmail()
], validate, authController.forgotPassword);

router.post("/reset-password/:token", [
    body("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter"),
    body("confirmPassword").custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Konfirmasi password tidak cocok");
        }
        return true;
    })
], validate, authController.resetPassword);

/**
 * 5. PROFILE & SESSION (Protected)
 */
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);

export default router;