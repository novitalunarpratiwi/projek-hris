import { Router } from "express";
import { register, login, forgotPassword, resetPassword } from "../controllers/auth.controller"; 
import { body } from "express-validator";

const router = Router();

const registerValidator = [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

const loginValidator = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

// ✅ Routes
router.post("/register", registerValidator, register);
router.post("/login", loginValidator, login);
router.post("/forgot-password", forgotPassword);

// ✅ Reset password route
router.post(
  "/reset-password/:token",
  [
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("confirmPassword").notEmpty().withMessage("Confirm password is required"),
  ],
  resetPassword
);

export default router;
