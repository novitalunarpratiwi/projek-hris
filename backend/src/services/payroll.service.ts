import prisma from "../utils/prisma";
import { AttendanceStatus, PayrollStatus } from "@prisma/client";

export const calculatePayroll = async (userId: number, month: number, year: number) => {
    // 1. Ambil data User beserta relasi "position"
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { 
            position: true 
        }
    });

    if (!user || !user.position) {
        throw new Error("Data user atau pengaturan jabatan tidak ditemukan");
    }

    const master = user.position; 

    // 2. Tentukan range tanggal untuk absensi bulan tersebut
    // UTC Safe: Pastikan jam awal dan akhir hari tercakup
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 3. Ambil data absensi bulan tersebut yang valid
    const attendances = await prisma.attendance.findMany({
        where: {
            userId,
            date: { gte: startDate, lte: endDate },
            // Pastikan hanya menghitung record yang benar-benar ada aktivitas (bukan mangkir/alpha)
            status: { 
                notIn: [AttendanceStatus.Absent] 
            }
        }
    });

    // 4. Kalkulasi Logika Gaji dari data Kehadiran
    let totalWorkHours = 0;
    let totalLateMins = 0;
    let totalAttendance = attendances.length;

    attendances.forEach(att => {
        // Konversi Decimal ke Number untuk kalkulasi matematika
        totalWorkHours += Number(att.workHours || 0);
        totalLateMins += att.lateDuration || 0;
    });

    // 5. Rumus Perhitungan Gaji Berdasarkan Schema
    const baseSalary = Number(master.baseSalary);
    const hourlyRate = Number(master.hourlyRate);
    const lateDeductionRate = Number(master.lateDeductionPerMin);
    
    // Tunjangan Tetap
    const fixedAllowances = 
        Number(master.allowance) + 
        Number(master.mealAllowance) + 
        Number(master.transportAllowance);

    // Gaji Variabel Berdasarkan Jam Kerja
    const earningsFromHours = totalWorkHours * hourlyRate;

    // Total Potongan Keterlambatan
    const totalDeductions = totalLateMins * lateDeductionRate;

    // Gaji Bersih (Net Salary)
    const netSalary = (baseSalary + fixedAllowances + earningsFromHours) - totalDeductions;

    // 6. Simpan atau Update ke tabel Payroll (Gunakan Upsert)
    return await prisma.payroll.upsert({
        where: {
            userId_month_year: { userId, month, year }
        },
        update: {
            total_work_hours: totalWorkHours,
            total_late_mins: totalLateMins,
            total_attendance: totalAttendance,
            basic_salary: baseSalary,
            
            // Simpan snapshot untuk histori (PENTING)
            meal_allowance_snapshot: master.mealAllowance,
            transport_allowance_snapshot: master.transportAllowance,
            late_deduction_rate_snapshot: master.lateDeductionPerMin,
            hourly_rate_snapshot: master.hourlyRate,
            
            allowances: fixedAllowances + earningsFromHours,
            deductions: totalDeductions,
            net_salary: netSalary,
            updated_at: new Date()
        },
        create: {
            userId,
            month,
            year,
            total_work_hours: totalWorkHours,
            total_late_mins: totalLateMins,
            total_attendance: totalAttendance,
            basic_salary: baseSalary,
            
            // Simpan snapshot
            meal_allowance_snapshot: master.mealAllowance,
            transport_allowance_snapshot: master.transportAllowance,
            late_deduction_rate_snapshot: master.lateDeductionPerMin,
            hourly_rate_snapshot: master.hourlyRate,
            
            allowances: fixedAllowances + earningsFromHours,
            deductions: totalDeductions,
            net_salary: netSalary,
            status: PayrollStatus.Draft // Default status
        }
    });
};