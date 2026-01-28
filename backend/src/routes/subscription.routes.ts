import { Router } from "express";
import * as subController from "../controllers/subscription.controller";
import * as superController from "../controllers/superadmin.controller"; 
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { Role } from "@prisma/client";

const router = Router();

// ==========================================
// 1. PUBLIC ROUTE (Tanpa Auth)
// ==========================================
// Midtrans mengirim notifikasi ke sini. Jangan diberi middleware authenticate!
router.post("/webhook", subController.handlePaymentWebhook);


// ==========================================
// 2. PROTECTED ROUTES (Hanya User Login)
// ==========================================
router.use(authenticate);

/* --- A. AKSES TENANT ADMIN (Kelola Billing Perusahaan Sendiri) --- */
// Superadmin diizinkan akses agar bisa bantu troubleshoot paket klien
const tenantAdminAccess = authorizeRoles(Role.admin, Role.superadmin);

// Ambil info paket aktif, sisa hari, dan kuota karyawan
router.get("/my-plan", tenantAdminAccess, subController.getMySubscription);

// Katalog paket Master yang tersedia (Data yang dibuat oleh Superadmin)
router.get("/plans", tenantAdminAccess, subController.getAvailablePlans);

// Lihat riwayat pembayaran perusahaan sendiri
router.get("/my-history", authorizeRoles(Role.admin), subController.getTransactionHistory);
router.get("/my-history/:id", authorizeRoles(Role.admin), subController.getTransactionDetail);

// Tombol Checkout (Pesan paket via Midtrans)
router.post("/checkout", authorizeRoles(Role.admin), subController.createCheckout);

// Sinkronisasi manual jika notifikasi pembayaran delay
router.get("/check-payment/:referenceId", authorizeRoles(Role.admin), subController.checkPaymentStatus);


/* --- B. AKSES SUPERADMIN (Kendali Platform SaaS Global) --- */
const superAccess = authorizeRoles(Role.superadmin);

// Mengelola Master Plan (Produk yang dijual ke semua Tenant)
router.get("/master-plans", superAccess, superController.getMasterPlans);
router.post("/master-plans", superAccess, superController.upsertMasterPlan);

// Audit finansial: Melihat SEMUA transaksi dari SEMUA perusahaan
router.get("/all-transactions", superAccess, subController.getAllTransactions);

// Aktivasi Manual (Tombol "Verify" jika dana masuk via Transfer Bank Manual)
router.post("/activate-manual/:transactionId", superAccess, subController.activateSubscriptionManual);

export default router;