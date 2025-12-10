import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend type Request supaya bisa pakai req.user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Middleware autentikasi JWT
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    // Jika header Authorization tidak ada
    if (!authHeader) {
      return res.status(401).json({ message: "Token tidak ada" });
    }

    // Ambil token dari format: "Bearer TOKEN"
    const token = authHeader.split(" ")[1];

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    // Simpan data token ke req.user
    req.user = decoded;

    // Lanjut ke endpoint berikutnya
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token tidak valid atau kadaluarsa" });
  }
};
