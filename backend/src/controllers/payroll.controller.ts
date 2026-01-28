import { Response } from "express";
import { Prisma, PayrollStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * HELPER: Konversi Decimal Prisma ke Number JS untuk kalkulasi matematika
 */
const dToN = (val: any): number => (val ? Number(val) : 0);

/**
 * ==========================================
 * 1. OPERASIONAL ADMIN (Generation & Processing)
 * ==========================================
 */

// GENERATE: Membuat record Draft awal dengan snapshot nilai gaji saat ini
export const generateMonthlyPayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.body;
        const companyId = req.user!.companyId!;

        if (!month || !year) {
            return res.status(400).json({ success: false, message: "Bulan dan Tahun wajib diisi." });
        }

        // Ambil karyawan aktif yang memiliki Jabatan di perusahaan ini
        const employees = await prisma.user.findMany({
            where: { companyId, role: "employee", status: "Active", positionId: { not: null } },
            include: { position: true }
        });

        let createdCount = 0;

        for (const emp of employees) {
            // Pastikan tidak ada duplikasi data untuk periode yang sama
            const existing = await prisma.payroll.findUnique({
                where: { userId_month_year: { userId: emp.id, month: Number(month), year: Number(year) } }
            });

            if (!existing && emp.position) {
                await prisma.payroll.create({
                    data: {
                        userId: emp.id,
                        companyId,
                        month: Number(month),
                        year: Number(year),
                        // SNAPSHOT: Penting! Menyimpan nilai gaji saat ini agar histori tetap akurat meski jabatan naik gaji nanti
                        basic_salary: emp.position.baseSalary,
                        meal_allowance_snapshot: emp.position.mealAllowance || 0,
                        transport_allowance_snapshot: emp.position.transportAllowance || 0,
                        late_deduction_rate_snapshot: emp.position.lateDeductionPerMin || 0,
                        hourly_rate_snapshot: emp.position.hourlyRate || 0,
                        allowances: emp.position.allowance || 0,
                        net_salary: 0, 
                        status: "Draft"
                    }
                });
                createdCount++;
            }
        }

        return res.status(201).json({ 
            success: true, 
            message: `${createdCount} slip gaji berhasil disiapkan sebagai Draft.` 
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// CALCULATE: Menarik data absensi dan menghitung nilai finansial secara otomatis
export const calculatePayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId!;

        const payroll = await prisma.payroll.findUnique({ where: { id: Number(id) } });

        if (!payroll || payroll.companyId !== companyId) {
            return res.status(404).json({ success: false, message: "Payroll tidak ditemukan." });
        }

        const startDate = new Date(payroll.year, payroll.month - 1, 1);
        const endDate = new Date(payroll.year, payroll.month, 0, 23, 59, 59);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Ambil semua absensi yang masuk hitungan gaji
            const attendances = await tx.attendance.findMany({
                where: { 
                    userId: payroll.userId, 
                    date: { gte: startDate, lte: endDate },
                    status: { in: ["OnTime", "Late", "AnnualLeave", "Sick"] }
                }
            });

            const totalAttendance = attendances.length;
            const totalLateMins = attendances.reduce((acc, curr) => acc + (curr.lateDuration || 0), 0);

            // 2. Gunakan nilai dari SNAPSHOT payroll (bukan dari tabel PositionSalary lagi)
            const basic = dToN(payroll.basic_salary);
            const fixedAllowance = dToN(payroll.allowances);
            const mealDaily = dToN(payroll.meal_allowance_snapshot);
            const transDaily = dToN(payroll.transport_allowance_snapshot);
            const lateRate = dToN(payroll.late_deduction_rate_snapshot);

            // 3. Rumus Kalkulasi
            const dailyBenefits = (mealDaily + transDaily) * totalAttendance;
            const lateDeduction = totalLateMins * lateRate;
            const netSalary = (basic + fixedAllowance + dailyBenefits) - lateDeduction;

            // 4. LOCKING: Tandai absensi sudah diproses agar tidak bisa diedit admin absensi
            await tx.attendance.updateMany({
                where: { userId: payroll.userId, date: { gte: startDate, lte: endDate } },
                data: { is_payroll_processed: true, payrollId: payroll.id }
            });

            return await tx.payroll.update({
                where: { id: payroll.id },
                data: {
                    total_attendance: totalAttendance,
                    total_late_mins: totalLateMins,
                    deductions: lateDeduction,
                    net_salary: netSalary,
                    status: "Review"
                }
            });
        });

        return res.json({ success: true, message: "Kalkulasi gaji berhasil diupdate.", data: result });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const approveAllMonthly = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.body;
        const companyId = req.user!.companyId!;

        const result = await prisma.payroll.updateMany({
            where: { companyId, month: Number(month), year: Number(year), status: "Review" },
            data: { status: "Approved" }
        });

        return res.json({ success: true, message: `${result.count} data payroll telah disetujui.` });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const bulkPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { payrollIds } = req.body; // Array of IDs
        const companyId = req.user!.companyId!;

        await prisma.payroll.updateMany({
            where: { id: { in: payrollIds.map(Number) }, companyId },
            data: { status: "Paid", paid_at: new Date(), payment_method: "MANUAL" }
        });

        return res.json({ success: true, message: "Status pembayaran berhasil diperbarui secara massal." });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * 2. MANAGEMENT & MONITORING
 * ==========================================
 */

export const getAllPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year, status } = req.query;
        const companyId = req.user!.companyId!;

        const data = await prisma.payroll.findMany({
            where: { 
                companyId,
                month: month ? Number(month) : undefined,
                year: year ? Number(year) : undefined,
                status: status as PayrollStatus
            },
            include: { 
                user: { 
                    select: { 
                        name: true, employeeId: true, bank_name: true, bank_account: true,
                        position: { select: { positionName: true } }
                    } 
                } 
            },
            orderBy: { id: 'desc' }
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const updatePayrollStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const companyId = req.user!.companyId!;

        const updated = await prisma.payroll.update({
            where: { id: Number(id), companyId },
            data: { 
                status: status as PayrollStatus,
                paid_at: status === "Paid" ? new Date() : null
            }
        });
        return res.json({ success: true, data: updated });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const deletePayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId!;

        const payroll = await prisma.payroll.findUnique({ where: { id: Number(id) } });
        if (!payroll || payroll.status === "Paid") {
            return res.status(400).json({ success: false, message: "Payroll sudah dibayar dan tidak bisa dihapus." });
        }

       await prisma.$transaction(async (tx) => {
    // 1. Buka kunci absensi yang terkait
    await tx.attendance.updateMany({
        where: { payrollId: Number(id) },
        data: { 
            is_payroll_processed: false, 
            payrollId: null 
        }
    });

    // 2. Hapus record payroll
    await tx.payroll.delete({ 
        where: { id: Number(id), companyId } 
    });
});

        return res.json({ success: true, message: "Data payroll berhasil dihapus." });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const getPayrollStats = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user!.companyId!;
        const summary = await prisma.payroll.aggregate({
            where: { companyId, status: "Paid" },
            _sum: { net_salary: true },
            _count: { id: true }
        });
        return res.json({ success: true, data: summary });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * 3. SELF SERVICE (KARYAWAN)
 * ==========================================
 */

export const getMyPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.payroll.findMany({
            where: { userId: req.user!.id, status: { in: ["Paid", "Approved"] } },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const getPayrollDetail = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.payroll.findUnique({
            where: { id: Number(req.params.id) },
            include: { 
                user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } }, 
                company: true,
                attendances: { orderBy: { date: 'asc' } }
            }
        });
        
        if (!data || (req.user?.role === "employee" && data.userId !== req.user.id)) {
            return res.status(403).json({ success: false, message: "Akses dilarang." });
        }
        
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * 4. SUPERADMIN
 * ==========================================
 */
export const getGlobalPayrollLogs = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.payroll.findMany({
            include: { 
                company: { select: { name: true } }, 
                user: { select: { name: true } } 
            },
            orderBy: { id: 'desc' },
            take: 100
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};