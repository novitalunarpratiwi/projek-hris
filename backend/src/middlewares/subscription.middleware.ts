import { Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "./auth.middleware";
import { SubscriptionStatus, Role } from "@prisma/client";

export const checkSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // 1. BYPASS UNTUK SUPERADMIN
        if (req.user?.role === Role.superadmin) return next();

        const companyId = req.user?.companyId;

        if (!companyId) {
            return res.status(401).json({ 
                success: false, 
                message: "Akses ditolak: Identitas perusahaan tidak ditemukan." 
            });
        }

        // 2. DETEKSI RUTE PENDAFTARAN KARYAWAN (Optimization)
        // Gunakan regex atau check yang lebih spesifik agar tidak salah deteksi rute lain
        const isCreateUserRoute = req.method === "POST" && req.originalUrl.endsWith("/users");

        // 3. QUERY SUBSCRIPTION
        const sub = await prisma.subscription.findUnique({
            where: { companyId: Number(companyId) },
            // PERBAIKAN: Prisma tidak menerima 'false' di include. 
            // Gunakan conditional object atau undefined.
            include: isCreateUserRoute ? {
                company: {
                    select: {
                        _count: {
                            select: { users: true }
                        }
                    }
                }
            } : undefined
        });

        if (!sub) {
            return res.status(403).json({ 
                success: false, 
                message: "Perusahaan Anda belum memiliki paket langganan aktif." 
            });
        }

        // 4. VALIDASI STATUS & EXPIRED DATE
        const now = new Date();
        const isExpired = sub.status === SubscriptionStatus.Expired || new Date(sub.endDate) < now;

        if (isExpired) {
            // OPTIONAL: Anda bisa menambahkan logic update status ke DB di sini (Lazy Update)
            return res.status(403).json({ 
                success: false, 
                message: "Masa aktif langganan telah berakhir.",
                code: "SUBSCRIPTION_EXPIRED"
            });
        }

        if (sub.status === SubscriptionStatus.Inactive) {
            return res.status(403).json({ 
                success: false, 
                message: "Layanan perusahaan Anda sedang dinonaktifkan." 
            });
        }

        // 5. VALIDASI KUOTA MAKSIMAL KARYAWAN
        if (isCreateUserRoute) {
            // Ambil jumlah user saat ini dari hasil include tadi
            const currentEmployeeCount = (sub as any).company?._count?.users || 0;
            const limit = Number(sub.maxEmployees);

            if (currentEmployeeCount >= limit) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Kuota pendaftaran karyawan penuh (Maks: ${limit}).`,
                    code: "QUOTA_FULL"
                });
            }
        }

        // Pasang data sub ke request agar bisa dipakai di controller (menghemat query lagi)
        (req as any).activeSubscription = sub;

        next();
    } catch (error: any) {
        console.error("Subscription Middleware Error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan sistem saat verifikasi langganan." 
        });
    }
};