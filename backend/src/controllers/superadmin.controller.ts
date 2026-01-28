import { Response } from "express";
import { Prisma, Role, SubscriptionStatus, PaymentStatus, UserStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * 1. PLATFORM METRICS & ANALYTICS
 */
export const getPlatformMetrics = async (req: AuthRequest, res: Response) => {
    try {
        const [totalTenants, totalUsers, totalRevenue, activeSubscriptions] = await Promise.all([
            prisma.company.count(),
            prisma.user.count({ where: { role: Role.employee } }),
            prisma.transaction.aggregate({
                where: { status: PaymentStatus.Success },
                _sum: { amount: true }
            }),
            prisma.subscription.count({ where: { status: SubscriptionStatus.Active } })
        ]);

        return res.json({
            success: true,
            data: {
                totalTenants,
                totalUsers,
                totalRevenue: Number(totalRevenue._sum.amount || 0),
                activeSubscriptions
            }
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. TENANT MANAGEMENT
 */
export const getAllTenants = async (req: AuthRequest, res: Response) => {
    try {
        const tenants = await prisma.company.findMany({
            include: {
                subscription: true,
                _count: { select: { users: true } }
            },
            orderBy: { created_at: 'desc' }
        });
        return res.json({ success: true, data: tenants });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getTenantDetail = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const tenant = await prisma.company.findUnique({
            where: { id: Number(id) },
            include: {
                subscription: true,
                users: {
                    where: { role: Role.admin },
                    select: { name: true, email: true, phone: true }
                },
                _count: { select: { users: true } }
            }
        });

        if (!tenant) return res.status(404).json({ success: false, message: "Tenant tidak ditemukan" });
        return res.json({ success: true, data: tenant });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTenantStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Active, Inactive, Suspended

        const tenant = await prisma.company.update({
            where: { id: Number(id) },
            data: { status }
        });

        return res.json({ success: true, message: "Status tenant diperbarui", data: tenant });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const terminateTenantAccess = async (req: AuthRequest, res: Response) => {
    try {
        const { companyId } = req.params;

        // Memutus akses total: Suspend Company dan Expire Subscription
        await prisma.$transaction([
            prisma.company.update({
                where: { id: Number(companyId) },
                data: { status: UserStatus.Suspended }
            }),
            prisma.subscription.update({
                where: { companyId: Number(companyId) },
                data: { status: SubscriptionStatus.Expired }
            })
        ]);

        return res.json({ success: true, message: "Akses tenant berhasil diputus secara total" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. MASTER PLAN MANAGEMENT
 */
export const getMasterPlans = async (req: AuthRequest, res: Response) => {
    try {
        const plans = await prisma.masterPlan.findMany({ orderBy: { price: 'asc' } });
        return res.json({ success: true, data: plans });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const upsertMasterPlan = async (req: AuthRequest, res: Response) => {
    try {
        const { id, name, price, maxEmployees, durationDays, isActive, description } = req.body;

        const plan = await prisma.masterPlan.upsert({
            where: { id: id || 0 },
            update: { 
                name, 
                price: new Prisma.Decimal(price), 
                maxEmployees: Number(maxEmployees), 
                durationDays: Number(durationDays), 
                isActive, 
                description 
            },
            create: { 
                name, 
                price: new Prisma.Decimal(price), 
                maxEmployees: Number(maxEmployees), 
                durationDays: Number(durationDays), 
                isActive: isActive ?? true, 
                description 
            }
        });

        return res.json({ success: true, message: "Master Plan berhasil disimpan", data: plan });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 4. BILLING & MANUAL ACTION
 */
export const getAllSystemTransactions = async (req: AuthRequest, res: Response) => {
    try {
        const transactions = await prisma.transaction.findMany({
            include: { company: { select: { name: true } } },
            orderBy: { created_at: 'desc' }
        });
        return res.json({ success: true, data: transactions });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
export const manualTransactionActivation = async (req: AuthRequest, res: Response) => {
    try {
        const { transactionId } = req.params;
        const trx = await prisma.transaction.findUnique({ where: { id: Number(transactionId) } });

        if (!trx || trx.status === "Success") {
            return res.status(400).json({ success: false, message: "Transaksi sudah aktif atau tidak ditemukan." });
        }

        await prisma.$transaction(async (tx) => {
            await tx.transaction.update({
                where: { id: trx.id },
                data: { status: "Success", paidAt: new Date(), paymentMethod: "MANUAL_OVERRIDE" }
            });

            const currentSub = await tx.subscription.findUnique({ where: { companyId: trx.companyId } });
            const now = new Date();
            
            const startDate = (currentSub && currentSub.endDate > now) ? currentSub.endDate : now;
            const newEndDate = new Date(startDate);
            newEndDate.setDate(newEndDate.getDate() + trx.durationSnapshot);

            await tx.subscription.upsert({
                where: { companyId: trx.companyId },
                update: {
                    status: "Active",
                    planName: trx.planName,
                    endDate: newEndDate,
                    maxEmployees: trx.maxEmployeesSnapshot,
                    lastTransactionId: trx.id
                },
                create: {
                    companyId: trx.companyId,
                    status: "Active",
                    planName: trx.planName,
                    startDate: now,
                    endDate: newEndDate,
                    maxEmployees: trx.maxEmployeesSnapshot,
                    lastTransactionId: trx.id,
                    price: trx.amount
                }
            });
        });

        return res.json({ success: true, message: "Langganan berhasil diaktifkan secara manual." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 5. SUBSCRIPTION INTERVENTION
 */
export const updateSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { companyId } = req.params;
        const { planName, endDate, maxEmployees, status } = req.body;

        const updatedSub = await prisma.subscription.update({
            where: { companyId: Number(companyId) },
            data: { 
                planName, 
                endDate: new Date(endDate), 
                maxEmployees: Number(maxEmployees),
                status 
            }
        });

        return res.json({ success: true, message: "Detail langganan tenant berhasil diubah", data: updatedSub });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 6. SYSTEM OPERATIONS
 */
export const seedDefaultPlans = async (req: AuthRequest, res: Response) => {
    try {
        const plans = [
            { name: "Basic", price: new Prisma.Decimal(250000), maxEmployees: 20, durationDays: 30, isActive: true, description: "Untuk UMKM kecil" },
            { name: "Pro", price: new Prisma.Decimal(750000), maxEmployees: 100, durationDays: 30, isActive: true, description: "Solusi bisnis berkembang" },
            { name: "Enterprise", price: new Prisma.Decimal(2000000), maxEmployees: 500, durationDays: 30, isActive: true, description: "Skala perusahaan besar" },
        ];

        await prisma.masterPlan.createMany({
            data: plans,
            skipDuplicates: true
        });

        return res.json({ success: true, message: "Paket default (Basic, Pro, Enterprise) berhasil dibuat" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
