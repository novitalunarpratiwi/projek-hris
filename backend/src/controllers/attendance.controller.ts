import { Request, Response } from "express";
import prisma from "../utils/prisma";

// Ambil semua attendance milik user
export const getAttendanceByUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id; // dari JWT middleware

    const attendances = await prisma.attendance.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });

    return res.json(attendances);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Clock In
export const clockIn = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Tentukan status
    const standardClockIn = new Date(`${now.toDateString()} 08:00:00`).getTime();
    const status = now.getTime() <= standardClockIn ? "On Time" : "Late";

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        date: now,
        clockIn: now,
        status,
      },
    });

    return res.json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Clock Out
export const clockOut = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: { userId, date: { gte: today } },
    });

    if (!attendance) {
      return res.status(400).json({ message: "No clock-in found for today" });
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: now },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
