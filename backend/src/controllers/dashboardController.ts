import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AttendanceStatus, Role, UserStatus, SubscriptionStatus } from "@prisma/client";

export const getDashboard = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        
        // 1. Inisialisasi Filter Waktu (Bulan Ini)
        const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year as string) || new Date().getFullYear();

        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);

        // Inisialisasi Hari Ini
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // ==========================================
        // A. LOGIKA EMPLOYEE (Personal Analytics)
        // ==========================================
        if (user.role === Role.employee) {
            const [attendanceRecords, userData, todayRecord] = await Promise.all([
                prisma.attendance.findMany({
                    where: { userId: user.id, date: { gte: startOfMonth, lte: endOfMonth } },
                    orderBy: { date: 'asc' }
                }),
                prisma.user.findUnique({
                    where: { id: user.id },
                    select: { 
                        name: true, role: true, profile_image: true, 
                        annual_leave_quota: true, leave_balance: true 
                    }
                }),
                prisma.attendance.findUnique({
                    where: { userId_date: { userId: user.id, date: todayStart } }
                })
            ]);

            const onTimeCount = attendanceRecords.filter(a => a.status === "OnTime").length;
            const lateCount = attendanceRecords.filter(a => a.status === "Late").length;
            const totalMinutes = attendanceRecords.reduce((acc, curr) => acc + (curr.workHours ? Number(curr.workHours) * 60 : 0), 0);

            return res.json({
                success: true,
                data: {
                    userProfile: userData,
                    todayStatus: todayRecord ? {
                        clockIn: todayRecord.clockIn,
                        clockOut: todayRecord.clockOut,
                        status: todayRecord.status
                    } : null,
                    summaryMetrics: {
                        workHours: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`,
                        onTime: onTimeCount,
                        late: lateCount,
                        leaveTaken: (userData?.annual_leave_quota || 0) - (userData?.leave_balance || 0)
                    },
                    attendanceStats: [
                        { name: "On Time", value: onTimeCount, color: "#5584b4" },
                        { name: "Late", value: lateCount, color: "#f18684" }
                    ],
                    dailyWorkLog: attendanceRecords.map(a => ({
                        date: a.date,
                        hours: Number(a.workHours || 0)
                    }))
                }
            });
        }

        // ==========================================
        // B. LOGIKA SUPERADMIN (Global Market Insights)
        // ==========================================
        if (user.role === Role.superadmin) {
            const [totalTenants, totalUsersGlobal, revenueData, recentTenants, planDistribution] = await Promise.all([
                prisma.company.count(),
                prisma.user.count(),
                prisma.transaction.aggregate({
                    where: { status: "Success" },
                    _sum: { amount: true }
                }),
                prisma.company.findMany({
                    take: 5,
                    orderBy: { created_at: 'desc' },
                    include: { subscription: { select: { planName: true, status: true } } }
                }),
                prisma.subscription.groupBy({
                    by: ['planName'],
                    _count: true
                })
            ]);

            return res.json({
                success: true,
                data: {
                    totalTenants,
                    totalUsers: totalUsersGlobal,
                    totalRevenue: Number(revenueData._sum.amount || 0),
                    recentTenants: recentTenants.map(t => ({
                        id: t.id,
                        name: t.name,
                        plan: t.subscription?.planName || "Trial",
                        status: t.status
                    })),
                    planDistribution: planDistribution.map(p => ({
                        name: p.planName,
                        value: p._count
                    }))
                }
            });
        }

        // ==========================================
        // C. LOGIKA ADMIN (HR & Operations Control)
        // ==========================================
        const tenantId = user.companyId as number;

        const [
            totalEmployee,
            activeEmployees,
            newEmployees, // Logika baru: Karyawan gabung bulan ini
            todayAttendance,
            subscription,
            contractStats
        ] = await Promise.all([
            prisma.user.count({ where: { companyId: tenantId, role: Role.employee } }),
            prisma.user.count({ where: { companyId: tenantId, status: UserStatus.Active, role: Role.employee } }),
            prisma.user.count({ where: { companyId: tenantId, join_date: { gte: startOfMonth, lte: endOfMonth } } }),
            prisma.attendance.findMany({
                where: { date: todayStart, user: { companyId: tenantId } },
                include: { user: { select: { name: true, profile_image: true } } }
            }),
            prisma.subscription.findUnique({ where: { companyId: tenantId } }),
            prisma.user.groupBy({
                by: ['contract_type'],
                where: { companyId: tenantId, role: Role.employee },
                _count: true
            })
        ]);

        // Hitung Rasio Kehadiran Hari Ini
        const onTimeToday = todayAttendance.filter(a => a.status === "OnTime").length;
        const lateToday = todayAttendance.filter(a => a.status === "Late").length;
        const absentToday = activeEmployees - todayAttendance.length;

        return res.json({
            success: true,
            data: {
                totalEmployee,
                activeEmployees,
                newEmployees,
                subscription: subscription ? {
                    plan: subscription.planName,
                    status: subscription.status,
                    endDate: subscription.endDate,
                    quotaUsage: `${activeEmployees}/${subscription.maxEmployees}`
                } : null,
                attendanceTodayStats: [
                    { name: "Hadir Tepat Waktu", value: onTimeToday, color: "#4CAF50" },
                    { name: "Terlambat", value: lateToday, color: "#FF9800" },
                    { name: "Tidak Hadir", value: absentToday < 0 ? 0 : absentToday, color: "#F44336" }
                ],
                attendanceTable: todayAttendance.map(a => ({
                    nama: a.user.name,
                    foto: a.user.profile_image,
                    status: a.status,
                    time: a.clockIn ? new Date(a.clockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "--.--"
                })),
                employeeStatus: contractStats.map(c => ({ 
                    name: c.contract_type || "Unknown", 
                    value: c._count 
                }))
            }
        });

    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Server Error: " + error.message });
    }
};