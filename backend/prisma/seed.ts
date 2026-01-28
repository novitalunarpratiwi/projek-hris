import { 
  PrismaClient, 
  Role, 
  UserStatus, 
  ContractType, 
  SubscriptionStatus, 
  PaymentStatus 
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Memulai proses seeding database HRIS Pro...");

  const adminPassword = process.env.SYSTEM_SUPER_PASSWORD || "Admin123";
  const hashedCommonPassword = await bcrypt.hash(adminPassword, 10);

  /**
   * 1. SEED MASTER PLANS
   */
  console.log("📦 Seeding Master Plans...");
  const plans = [
    { name: "Basic", price: 250000, maxEmployees: 10, durationDays: 30, description: "Cocok untuk UMKM kecil" },
    { name: "Pro", price: 750000, maxEmployees: 50, durationDays: 30, description: "Solusi untuk bisnis berkembang" },
    { name: "Enterprise", price: 2000000, maxEmployees: 500, durationDays: 30, description: "Fitur lengkap untuk korporat" },
  ];

  for (const plan of plans) {
    await prisma.masterPlan.upsert({
      where: { name: plan.name },
      update: { price: plan.price, maxEmployees: plan.maxEmployees },
      create: { ...plan, isActive: true },
    });
  }

  /**
   * 2. SEED SUPERADMIN
   */
  console.log("👑 Seeding Superadmin...");
  const superadmin = await prisma.user.upsert({
    where: { email: "intan@supersuper" },
    update: {},
    create: {
      name: "Intan Tania (Root)",
      email: "intan@supersuper",
      password: hashedCommonPassword,
      role: Role.superadmin,
      status: UserStatus.Active,
      is_verified: true,
      contract_type: ContractType.Tetap,
    },
  });

  /**
   * 3. SEED TENANT DEMO (PT Demo Indonesia)
   */
  console.log("🏢 Seeding Tenant Demo...");
  const company = await prisma.company.upsert({
    where: { domain: "demo.com" }, // Asumsi menggunakan domain unik
    update: {},
    create: {
      name: "PT Demo Indonesia",
      domain: "demo.com",
      address: "Jl. Sudirman No. 1, Jakarta Pusat",
      status: UserStatus.Active,
    },
  });

  // A. Subscription Perusahaan
  await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      planName: "Pro Plan",
      status: SubscriptionStatus.Active,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      maxEmployees: 50,
      price: 750000,
    },
  });

  // B. Transaksi Sukses (Untuk Grafik Revenue)
  await prisma.transaction.createMany({
    data: [
      {
        companyId: company.id,
        planName: "Pro Plan",
        amount: 750000,
        status: PaymentStatus.Success,
        referenceId: "REF-DEMO-001",
        invoiceId: "INV-2024-001",
        maxEmployeesSnapshot: 50,
        durationSnapshot: 30,
        paidAt: new Date(),
      },
      {
        companyId: company.id,
        planName: "Basic Upgrade",
        amount: 250000,
        status: PaymentStatus.Success,
        referenceId: "REF-DEMO-002",
        invoiceId: "INV-2024-002",
        maxEmployeesSnapshot: 10,
        durationSnapshot: 30,
        paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      }
    ]
  });

  /**
   * 4. SEED TRANSAKSI PENDING (Untuk Test Verify Billing)
   */
  console.log("⏳ Seeding Pending Transaction...");
  const startupCo = await prisma.company.create({
    data: { name: "Startup Nusantara", status: UserStatus.Active }
  });

  await prisma.transaction.create({
    data: {
      companyId: startupCo.id,
      planName: "Enterprise",
      amount: 2000000,
      status: PaymentStatus.Pending,
      referenceId: "REF-PENDING-999",
      invoiceId: "INV-VERIFY-TEST",
      maxEmployeesSnapshot: 500,
      durationSnapshot: 30,
    }
  });

  /**
   * 5. SEED AUDIT LOGS (Untuk Test Activity Log)
   */
  console.log("📝 Seeding Audit Logs...");
  await prisma.auditLog.createMany({
    data: [
      {
        action: "LOGIN_SUPERADMIN",
        details: "Superadmin root berhasil masuk ke sistem",
        userId: superadmin.id,
        target: "Auth",
      },
      {
        action: "CREATE_PLAN",
        details: "Menambahkan paket 'Enterprise' ke katalog master",
        userId: superadmin.id,
        target: "MasterPlan",
      },
      {
        action: "TERMINATE_TENANT",
        details: "Memutus akses perusahaan PT. Ilegal karena pelanggaran TOS",
        userId: superadmin.id,
        target: "Company",
      }
    ]
  });

  console.log(`
  ✅ SEEDING BERHASIL!
  ---------------------------------------
  Login Superadmin:
  Email: intan@supersuper
  Pass : Admin123 (Sesuai default)

  Data Tersedia:
  - Grafik Pendapatan: Aktif (dari 2 transaksi sukses)
  - Menu Billing: 1 Transaksi Pending siap di-Verify
  - Menu Audit Log: 3 aktivitas sistem siap dipantau
  ---------------------------------------
  `);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });