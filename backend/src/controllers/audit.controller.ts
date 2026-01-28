import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * 1. GET GLOBAL AUDIT LOGS
 * Akses: Superadmin Only
 * Menampilkan semua aktivitas dari seluruh perusahaan di sistem.
 */
export const getGlobalAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const { action, companyId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = {};
        if (action) where.action = String(action);
        if (companyId) where.companyId = Number(companyId);

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true, role: true } },
                    company: { select: { name: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma.auditLog.count({ where })
        ]);

        return res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. GET COMPANY AUDIT LOGS
 * Akses: Admin Perusahaan
 * Menampilkan aktivitas khusus untuk perusahaan yang sedang login saja.
 */
export const getCompanyAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const { action, userId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Filter wajib: companyId harus sesuai dengan perusahaan admin yang login
        const where: any = {
            companyId: admin.companyId
        };

        if (action) where.action = String(action);
        if (userId) where.userId = Number(userId);

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true, employeeId: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma.auditLog.count({ where })
        ]);

        return res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};