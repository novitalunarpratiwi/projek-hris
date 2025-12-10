// File: src/controllers/dashboard.controller.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    annual_leave_quota: number;
  };
}

const formatMinutesToHours = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

export const getEmployeeDashboard = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Attendance bulan ini
    const monthlyAttendance = await prisma.attendance.findMany({
      where: {
        userId,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { date: "desc" },
    });

    // Leave summary
    const takenLeaves = await prisma.leave.aggregate({
      _sum: { days_taken: true },
      where: { userId, status: "Approved" },
    });

    let totalWorkMinutes = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    const attendanceStats: Record<string, number> = {};

    for (const entry of monthlyAttendance) {
      attendanceStats[entry.status] = (attendanceStats[entry.status] || 0) + 1;

      if (entry.status === "On Time") onTimeCount++;
      if (entry.status === "Late") lateCount++;
      if (entry.status === "Absent") absentCount++;

      if (entry.clockIn && entry.clockOut) {
        const diffMs = entry.clockOut.getTime() - entry.clockIn.getTime();
        totalWorkMinutes += Math.floor(diffMs / (1000 * 60));
      }
    }

    const annualQuota = req.user?.annual_leave_quota || 15;
    const takenDays = takenLeaves._sum.days_taken || 0;
    const remainingDays = annualQuota - takenDays;

    const dailyWorkLog = monthlyAttendance.slice(0, 5).reverse().map((entry) => {
      let workDurationMinutes = 0;
      if (entry.clockIn && entry.clockOut) {
        const diffMs = entry.clockOut.getTime() - entry.clockIn.getTime();
        workDurationMinutes = Math.floor(diffMs / (1000 * 60));
      }
      return {
        date: entry.date.toISOString().split("T")[0],
        workDurationDisplay: formatMinutesToHours(workDurationMinutes),
      };
    });

    return res.json({
      success: true,
      data: {
        summaryMetrics: {
          totalWorkHours: formatMinutesToHours(totalWorkMinutes),
          onTimeCount,
          lateCount,
          absentCount,
        },
        leaveSummary: {
          totalQuota: annualQuota,
          taken: takenDays,
          remaining: remainingDays,
        },
        attendanceStats,
        dailyWorkLog,
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
