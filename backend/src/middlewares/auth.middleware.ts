import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import { User, Role, UserStatus } from "@prisma/client";

// 1. Definisikan tipe User yang sudah termasuk relasi Company
// Ini agar TypeScript tidak komplain saat Anda memanggil req.user.company
export type UserWithCompany = Omit<User, "password"> & {
  company: {
    status: UserStatus;
  } | null;
};

export interface AuthRequest extends Request {
  user?: UserWithCompany;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Akses ditolak: Token tidak ditemukan" });
    }

    const token = header.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error("JWT_SECRET belum dikonfigurasi di .env");
    }

    const decoded = jwt.verify(token, jwtSecret) as { id: number };

    // 2. Gunakan select untuk membuang password dari memori
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        profile_image: true,
        // Sertakan relasi company
        company: {
          select: { status: true }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Sesi tidak valid: User tidak ditemukan" });
    }

    // 3. Cek Status User
    if (user.status !== UserStatus.Active) {
      return res.status(403).json({ 
        success: false, 
        message: `Akun Anda sedang ${user.status.toLowerCase()}. Silakan hubungi admin.` 
      });
    }

    // 4. Cek Status Perusahaan (Tenant Validation)
    if (user.role !== Role.superadmin) {
      if (!user.company || user.company.status !== UserStatus.Active) {
        return res.status(403).json({ 
          success: false, 
          message: "Akses ditolak: Perusahaan Anda tidak aktif atau ditangguhkan." 
        });
      }
    }

    // Masukkan user (tanpa password) ke request
    req.user = user as UserWithCompany;
    next();
  } catch (err: any) {
    // Handling error JWT yang lebih spesifik
    let msg = "Token tidak valid";
    if (err.name === "TokenExpiredError") msg = "Sesi Anda telah berakhir, silakan login kembali";
    
    return res.status(401).json({ success: false, message: msg });
  }
};

export const authorizeRoles = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Autentikasi diperlukan" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Izin ditolak: Role ${req.user.role} tidak diizinkan mengakses rute ini` 
      });
    }

    next();
  };
};

export const adminOnly = authorizeRoles(Role.admin, Role.superadmin);