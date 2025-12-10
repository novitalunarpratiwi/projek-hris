import { Request, Response } from "express";
import prisma from "../utils/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import crypto from "crypto";
import nodemailer from "nodemailer";

/* =========================================================
   REGISTER CONTROLLER
========================================================= */
export const register = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, confirmPassword } = req.body;

    // Validasi confirmPassword
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "employee", // default role
      },
    });

    return res.status(201).json({
      message: "Register successful",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};




/* =========================================================
   LOGIN CONTROLLER
========================================================= */
export const login = async (req: Request, res: Response) => {
  try {
    // validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // find user
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.status(404).json({ message: "Email not found" });

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(400).json({ message: "Incorrect password" });

    // create token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    return res.json({
          message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,              // tambahkan
        role: user.role,
        profile_image: user.profile_image || null,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   FORGOT PASSWORD CONTROLLER
========================================================= */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Cek user berdasarkan email
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "Email not registered" });
    }

    // Generate token reset
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // Token valid 10 menit

    // Simpan token & expired ke database
    await prisma.user.update({
      where: { email },
      data: {
        reset_token: token,
        reset_token_expired: expiresAt,
      },
    });

    // Link reset password
    const resetLink = `http://localhost:3000/Auth/reset-password/${token}`;

    // Nodemailer config
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // dari .env
        pass: process.env.EMAIL_PASS, // dari .env
      },
    });

    // Kirim email reset password
    await transporter.sendMail({
      from: `HRIS System <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset Password Request",
      html: `
        <h3>Reset Password</h3>
        <p>We received a request to reset your password.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}" target="_blank">${resetLink}</a>
        <br><br>
        <small>This link will expire in 10 minutes.</small>
      `,
    });

    return res.json({ message: "Reset link successfully sent to your email." });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   RESET PASSWORD CONTROLLER
========================================================= */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params; // dari URL
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({ message: "Password and confirmPassword are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Cari user berdasarkan token
    const user = await prisma.user.findFirst({
      where: { reset_token: token },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Cek expired
    if (!user.reset_token_expired || user.reset_token_expired < new Date()) {
      return res.status(400).json({ message: "Token has expired" });
    }

    // Hash password baru
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_token: null,
        reset_token_expired: null,
      },
    });

    return res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
