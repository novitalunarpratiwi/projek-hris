import { Request, Response } from "express";
import { Prisma, SubscriptionStatus, PaymentStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
const midtransClient = require('midtrans-client');
import crypto from "crypto";

const snap = new midtransClient.Snap({
    isProduction: false, // Set ke true jika sudah live
    serverKey: process.env.MIDTRANS_SERVER_KEY || "",
    clientKey: process.env.MIDTRANS_CLIENT_KEY || ""
});

/**
 * HELPER: Logika Aktivasi & Stacking Masa Aktif
 * Digunakan oleh Webhook dan Aktivasi Manual Superadmin.
 */
async function processSubscriptionActivation(transactionId: number, tx: Prisma.TransactionClient) {
    const trx = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!trx) throw new Error("Transaksi tidak ditemukan.");

    // 1. Update status transaksi
    await tx.transaction.update({
        where: { id: trx.id },
        data: { status: PaymentStatus.Success, paidAt: new Date() }
    });

    // 2. Hitung Stacking
    const currentSub = await tx.subscription.findUnique({ where: { companyId: trx.companyId } });
    const now = new Date();

    // Jika paket masih aktif, tambah dari tanggal expired. Jika sudah mati, mulai dari sekarang.
    const startDate = (currentSub && currentSub.endDate > now && currentSub.status === SubscriptionStatus.Active)
        ? currentSub.endDate
        : now;

    const newEndDate = new Date(startDate);
    newEndDate.setDate(newEndDate.getDate() + trx.durationSnapshot);

    // 3. Upsert Langganan Perusahaan
    await tx.subscription.upsert({
        where: { companyId: trx.companyId },
        update: {
            planName: trx.planName,
            status: SubscriptionStatus.Active,
            endDate: newEndDate,
            maxEmployees: trx.maxEmployeesSnapshot,
            price: trx.amount,
            lastTransactionId: trx.id
        },
        create: {
            companyId: trx.companyId,
            planName: trx.planName,
            status: SubscriptionStatus.Active,
            startDate: now,
            endDate: newEndDate,
            maxEmployees: trx.maxEmployeesSnapshot,
            price: trx.amount,
            lastTransactionId: trx.id
        }
    });
}

/**
 * 1. WEBHOOK PAYMENT (Public)
 */
export const handlePaymentWebhook = async (req: Request, res: Response) => {
    try {
        const { order_id, status_code, gross_amount, transaction_status, signature_key } = req.body;

        // VERIFIKASI SIGNATURE (Mencegah Fraud/Hacker mengirim data palsu)
        const serverKey = process.env.MIDTRANS_SERVER_KEY!;
        const hash = crypto.createHash('sha512')
            .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
            .digest('hex');

        if (signature_key !== hash) {
            return res.status(401).json({ message: "Invalid signature" });
        }

        const trx = await prisma.transaction.findUnique({ where: { referenceId: order_id } });
        if (!trx || trx.status === PaymentStatus.Success) {
            return res.status(200).json({ message: "Transaction ignored" });
        }

        if (["settlement", "capture"].includes(transaction_status)) {
            await prisma.$transaction(async (tx) => {
                await processSubscriptionActivation(trx.id, tx);
            });
        } else if (["expire", "cancel", "deny"].includes(transaction_status)) {
            await prisma.transaction.update({
                where: { id: trx.id },
                data: { status: PaymentStatus.Failed }
            });
        }

        return res.status(200).json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

/**
 * 2. GET MY SUBSCRIPTION (Tenant Admin)
 */
export const getMySubscription = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user!.companyId!;
        let sub = await prisma.subscription.findUnique({
            where: { companyId },
            include: { company: { select: { _count: { select: { users: { where: { role: 'employee' } } } } } } }
        });

        if (!sub) return res.status(404).json({ success: false, message: "Belum ada langganan" });

        const now = new Date();

        // LOGIKA AUTO-EXPIRE: Jika sudah lewat waktu tapi di DB masih 'Active'
        if (sub.status === SubscriptionStatus.Active && sub.endDate < now) {
            sub = await prisma.subscription.update({
                where: { id: sub.id },
                data: { status: SubscriptionStatus.Expired },
                include: { company: { select: { _count: { select: { users: { where: { role: 'employee' } } } } } } }
            });
        }

        const daysLeft = Math.ceil((sub.endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        
        return res.json({ 
            success: true, 
            data: { 
                ...sub, 
                daysLeft: daysLeft > 0 ? daysLeft : 0,
                activeEmployees: sub.company._count.users 
            } 
        });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 3. GET AVAILABLE PLANS (Tenant Admin)
 */
export const getAvailablePlans = async (req: AuthRequest, res: Response) => {
    try {
        const plans = await prisma.masterPlan.findMany({ where: { isActive: true } });
        return res.json({ success: true, data: plans });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 4. CREATE CHECKOUT (Tenant Admin)
 */
export const createCheckout = async (req: AuthRequest, res: Response) => {
    try {
        const { planId } = req.body;
        const companyId = req.user!.companyId!;

        const plan = await prisma.masterPlan.findUnique({ where: { id: Number(planId) } });
        if (!plan) return res.status(404).json({ message: "Paket tidak ditemukan" });

        // VALIDASI KUOTA: Jangan biarkan user beli paket yang limitnya lebih kecil dari jumlah karyawan saat ini
        const currentEmployeeCount = await prisma.user.count({
            where: { companyId, role: "employee" }
        });

        if (currentEmployeeCount > plan.maxEmployees) {
            return res.status(400).json({
                success: false,
                message: `Gagal. Karyawan aktif Anda (${currentEmployeeCount}) melebihi batas paket ini (${plan.maxEmployees}).`
            });
        }

        const refId = `INV-${Date.now()}-${companyId}`;

        const transaction = await prisma.transaction.create({
            data: {
                companyId,
                planId: plan.id,
                referenceId: refId,
                invoiceId: refId,
                planName: plan.name,
                amount: plan.price,
                maxEmployeesSnapshot: plan.maxEmployees,
                durationSnapshot: plan.durationDays,
                status: PaymentStatus.Pending
            }
        });

        const midtransResponse = await snap.createTransaction({
            transaction_details: { order_id: refId, gross_amount: Number(plan.price) },
            customer_details: { first_name: req.user!.name, email: req.user!.email }
        });

        await prisma.transaction.update({
            where: { id: transaction.id },
            data: { snapToken: midtransResponse.token }
        });

        return res.status(201).json({ success: true, snapToken: midtransResponse.token, data: transaction });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Gagal membuat sesi pembayaran" });
    }
};

/**
 * 5. GET TRANSACTION HISTORY & DETAIL (Tenant Admin)
 */
export const getTransactionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const history = await prisma.transaction.findMany({
            where: { companyId: req.user!.companyId! },
            orderBy: { created_at: "desc" }
        });
        return res.json({ success: true, data: history });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const getTransactionDetail = async (req: AuthRequest, res: Response) => {
    try {
        const trx = await prisma.transaction.findFirst({
            where: { id: Number(req.params.id), companyId: req.user!.companyId! }
        });
        if (!trx) return res.status(404).json({ message: "Transaksi tidak ditemukan" });
        return res.json({ success: true, data: trx });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 6. CHECK PAYMENT STATUS (Tenant Admin)
 */
export const checkPaymentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const trx = await prisma.transaction.findUnique({
            where: { referenceId: req.params.referenceId, companyId: req.user!.companyId! }
        });
        return res.json({ success: true, status: trx?.status });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 7. GET ALL TRANSACTIONS (Superadmin)
 */
export const getAllTransactions = async (req: AuthRequest, res: Response) => {
    try {
        const all = await prisma.transaction.findMany({
            include: { company: { select: { name: true } } },
            orderBy: { created_at: "desc" }
        });
        return res.json({ success: true, data: all });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 8. ACTIVATE MANUALLY (Superadmin)
 */
export const activateSubscriptionManual = async (req: AuthRequest, res: Response) => {
    try {
        const { transactionId } = req.params;
        await prisma.$transaction(async (tx) => {
            await processSubscriptionActivation(Number(transactionId), tx);
        });
        return res.json({ success: true, message: "Langganan berhasil diaktifkan secara manual." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};