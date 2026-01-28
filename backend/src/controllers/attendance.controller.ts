import { Response } from "express";
import { Prisma, AttendanceStatus, Role, LeaveStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
/**
 * HELPER: Menghitung jarak (Haversine Formula) untuk Geofencing
 */
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radius bumi dalam meter
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * HELPER: Mendapatkan tanggal hari ini (00:00:00) zona Asia/Jakarta
 */
const getTodayDate = () => {
    const now = new Date();
    const jakartaDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    return new Date(jakartaDate + "T00:00:00.000Z");
};

/**
 * 1. CLOCK IN / OUT (Employee)
 * Alur: Cek Radius -> Cek Libur/Weekend -> Upsert Clock In/Out
 */
export const addCheckClock = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        const { tipeAbsensi, latitude, longitude, deviceName, addressDetail } = req.body;
        
        // Pastikan koordinat ada
        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: "Koordinat GPS tidak ditemukan." });
        }

        const today = getTodayDate(); // Pastikan ini menghasilkan 00:00:00 zona lokal
        const now = new Date();

        if (!user.companyId) return res.status(403).json({ success: false, message: "Akses ditolak." });

        // --- 1. VALIDASI SUBSCRIPTION ---
        const subscription = await prisma.subscription.findUnique({
            where: { companyId: user.companyId }
        });

        if (!subscription || subscription.status === "Expired" || new Date(subscription.endDate) < now) {
            return res.status(403).json({ 
                success: false, 
                message: "Masa langganan perusahaan habis. Silakan hubungi Admin." 
            });
        }

        // --- 2. CEK GEOFENCING ---
        const office = await prisma.officeSetting.findFirst({ where: { companyId: user.companyId } });
        if (office) {
            const distance = getDistance(Number(latitude), Number(longitude), Number(office.latitude), Number(office.longitude));
            if (distance > office.radius) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Di luar radius kantor (${Math.round(distance)}m). Maksimal ${office.radius}m.` 
                });
            }
        }

        // Cari record absensi hari ini
        const record = await prisma.attendance.findUnique({
            where: { userId_date: { userId: user.id, date: today } }
        });

        // --- 3. CEK LOCK PAYROLL & STATUS KHUSUS ---
        if (record?.is_payroll_processed) {
            return res.status(403).json({ success: false, message: "Absensi sudah dikunci oleh Payroll." });
        }

        // PROTEKSI: Jangan biarkan absen jika sedang Cuti atau Sakit
        if (record?.status === "AnnualLeave" || record?.status === "Sick") {
            return res.status(400).json({ 
                success: false, 
                message: `Anda tidak bisa absen karena status hari ini: ${record.status}` 
            });
        }
// --- 4. LOGIKA CLOCK IN ---
if (tipeAbsensi === "Masuk") {
    // A. CEK PALING AWAL: Apakah sudah absen masuk?
    // Jangan lakukan query lain sebelum ini lolos.
    if (record?.clockIn) {
        return res.status(400).json({ success: false, message: "Anda sudah absen masuk hari ini." });
    }

    // B. PROTEKSI AKHIR PEKAN (SABTU & MINGGU)
    const dayOfWeek = now.getDay(); // 0 = Minggu, 6 = Sabtu
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // C. QUERY DATA PENDUKUNG SECARA PARALEL (Lebih Cepat)
    const [isHoliday, setting] = await Promise.all([
        prisma.holiday.findUnique({ 
            where: { companyId_date: { companyId: user.companyId!, date: today } } 
        }),
        prisma.attendanceSetting.findUnique({ 
            where: { companyId_name: { companyId: user.companyId!, name: "clockInTime" } } 
        })
    ]);

    // D. LOGIKA BLOKIR (Hanya boleh absen jika bukan weekend & bukan holiday)
    // Kecuali kamu punya sistem lembur, biasanya absen reguler ditolak di hari ini.
    if (isWeekend || isHoliday) {
        const reason = isWeekend ? "Akhir Pekan" : `Hari Libur (${isHoliday?.name})`;
        return res.status(400).json({ 
            success: false, 
            message: `Sistem menolak absensi reguler di ${reason}.` 
        });
    }

    // E. KALKULASI KETERLAMBATAN
    const [h, m] = (setting?.value || "08:00").split(":").map(Number);
    const scheduleTime = new Date(today);
    scheduleTime.setHours(h, m, 0, 0);

    const isLate = now.getTime() > scheduleTime.getTime();
    const lateDuration = isLate ? Math.floor((now.getTime() - scheduleTime.getTime()) / 60000) : 0;

    // F. EKSEKUSI DATA
    const newRecord = await prisma.attendance.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: {
            clockIn: now,
            clockInDevice: deviceName,
            latIn: String(latitude),
            longIn: String(longitude),
            status: isLate ? AttendanceStatus.Late : AttendanceStatus.OnTime,
            isLate: isLate, 
            lateDuration: lateDuration,
            detailAlamat: addressDetail,
            tipeAbsensi: "Hadir",
        },
        create: {
            userId: user.id,
            date: today,
            clockIn: now,
            clockInDevice: deviceName,
            latIn: String(latitude),
            longIn: String(longitude),
            status: isLate ? AttendanceStatus.Late : AttendanceStatus.OnTime,
            isLate: isLate, 
            lateDuration: lateDuration,
            detailAlamat: addressDetail, 
            tipeAbsensi: "Hadir", 
            is_holiday: false 
        }
    });

    return res.json({ success: true, message: "Clock-in Berhasil", data: newRecord });
}

        // --- 5. LOGIKA CLOCK OUT ---
        if (tipeAbsensi === "Pulang") {
            if (!record?.clockIn) return res.status(400).json({ success: false, message: "Absen masuk belum ditemukan." });
            if (record.clockOut) return res.status(400).json({ success: false, message: "Anda sudah absen pulang." });

            const diffMs = now.getTime() - new Date(record.clockIn).getTime();
            const workHoursValue = parseFloat((diffMs / 3600000).toFixed(2));

            const updated = await prisma.attendance.update({
                where: { id: record.id },
                data: {
                    clockOut: now,
                    workHours: workHoursValue,
                    latOut: String(latitude), 
                    longOut: String(longitude),
                    clockOutDevice: deviceName
                }
            });

            return res.json({ success: true, message: "Clock-out Berhasil", data: updated });
        }

        return res.status(400).json({ success: false, message: "Tipe absensi tidak valid." });

    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
/**
 * 2. MONITORING DASHBOARD (Admin)
 * Melihat semua absensi hari ini di perusahaan tersebut.
 */
export const getAllAttendance = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const { date, search } = req.query;
        const targetDate = date ? new Date(date as string) : getTodayDate();

        const data = await prisma.attendance.findMany({
            where: {
                date: targetDate,
                user: { 
                    companyId: admin.companyId,
                    name: { contains: search ? String(search) : undefined }
                }
            },
            include: { user: { select: { name: true, employeeId: true, profile_image: true, position: { select: { positionName: true } } } } },
            orderBy: { clockIn: 'desc' }
        });

        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 3. DETAIL HISTORI PER USER (Admin)
 */
export const getAttendanceByUser = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        const admin = req.user!;

        const data = await prisma.attendance.findMany({
            where: {
                userId: Number(userId),
                user: { companyId: admin.companyId } // Security filter
            },
            orderBy: { date: 'desc' },
            take: 31
        });

        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 4. UPDATE MANUAL / KOREKSI (Admin)
 */
export const updateAttendanceManual = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const admin = req.user!;

        const check = await prisma.attendance.findFirst({
            where: { id: Number(id), user: { companyId: admin.companyId } }
        });

        if (!check) return res.status(404).json({ success: false, message: "Data tidak ditemukan." });
        if (check.is_payroll_processed) return res.status(403).json({ success: false, message: "Data sudah terkunci oleh payroll." });

        const updated = await prisma.attendance.update({
            where: { id: Number(id) },
            data: { status: status as AttendanceStatus }
        });

        await prisma.auditLog.create({
            data: {
                userId: admin.id, companyId: admin.companyId!,
                action: "EDIT_ATTENDANCE", target: `ID:${id}`,
                details: `Ubah status ke ${status}. Alasan: ${reason}`
            }
        });

        return res.json({ success: true, message: "Koreksi berhasil disimpan", data: updated });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 5. GET REPORT (Admin)
 */
const PDFDocument = require("pdfkit-table");
export const getAttendanceReport = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.query;
        const companyId = req.user!.companyId;

        const data = await prisma.attendance.findMany({
            where: {
                user: { companyId },
                date: {
                    gte: new Date(Number(year), Number(month) - 1, 1),
                    lte: new Date(Number(year), Number(month), 0)
                }
            },
            include: { user: { include: { position: true } } },
            orderBy: { date: 'asc' }
        });

        // CARA TERAMAN: Definisikan tipe datanya sebagai 'any' di sebelah kiri
        const doc: any = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${month}_${year}.pdf`);

        doc.pipe(res);

        // Header Dokumen
        doc.fontSize(20).text("LAPORAN KEHADIRAN KARYAWAN", { align: 'center' });
        doc.fontSize(10).text(`Periode: ${month} / ${year}`, { align: 'center' });
        doc.moveDown(2);

        // Tabel Konfigurasi
        const table = {
            headers: [
                { label: "TANGGAL", property: 'date', width: 80 },
                { label: "NAMA KARYAWAN", property: 'name', width: 150 },
                { label: "MASUK", property: 'in', width: 70 },
                { label: "KELUAR", property: 'out', width: 70 },
                { label: "STATUS", property: 'status', width: 100 },
            ],
            rows: data.map(item => [
                item.date.toLocaleDateString('id-ID'),
                item.user.name,
                item.clockIn ? new Date(item.clockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                item.clockOut ? new Date(item.clockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                item.status
            ])
        };

        // Menggunakan await karena .table adalah proses async di pdfkit-table
        await doc.table(table, { 
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
            prepareRow: () => doc.font("Helvetica").fontSize(10)
        });

        doc.end();

    } catch (error: any) {
        console.error("PDF Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Gagal: " + error.message });
        }
    }
};

/**
 * 6. BULK UPDATE (Admin)
 */
export const bulkUpdateAttendance = async (req: AuthRequest, res: Response) => {
    try {
        const { userIds, date, status } = req.body;
        const companyId = req.user!.companyId!;
        const targetDate = new Date(date);
        targetDate.setHours(0,0,0,0);

        const operations = userIds.map((uId: number) => 
            prisma.attendance.upsert({
                where: { userId_date: { userId: uId, date: targetDate } },
                update: { status: status as AttendanceStatus },
                create: { userId: uId, date: targetDate, status: status as AttendanceStatus, tipeAbsensi: "Manual Bulk" }
            })
        );

        await prisma.$transaction(operations);
        return res.json({ success: true, message: "Update massal berhasil" });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

/**
 * 7. GET MY ATTENDANCE & TODAY (Employee)
 */
export const getMyAttendance = async (req: AuthRequest, res: Response) => {
    const data = await prisma.attendance.findMany({
        where: { userId: req.user!.id },
        orderBy: { date: 'desc' },
        take: 31
    });
    return res.json({ success: true, data });
};

export const getTodayAttendance = async (req: AuthRequest, res: Response) => {
    const today = getTodayDate();
    const data = await prisma.attendance.findUnique({
        where: { userId_date: { userId: req.user!.id, date: today } }
    });
    return res.json({ success: true, data });
};

/**
 * 1. GET OFFICE DATA
 * Mengambil konfigurasi lokasi kantor untuk ditampilkan di halaman settings admin
 */
export const getOfficeData = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;

        // Cari data kantor dari tabel OfficeSetting
        const office = await prisma.officeSetting.findFirst({
            where: { companyId: Number(companyId) }
        });

        // Cari data jam masuk dari tabel AttendanceSetting
        const timeSetting = await prisma.attendanceSetting.findUnique({
            where: { 
                companyId_name: { 
                    companyId: Number(companyId), 
                    name: "clockInTime" 
                } 
            }
        });

        return res.json({
            success: true,
            data: office,
            clockInTime: timeSetting?.value || "08:00" // Default jika belum diatur
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. UPDATE OFFICE SETTINGS (GEOFENCING)
 * Mengupdate atau membuat koordinat kantor (Lat, Long, Radius)
 */
export const updateOfficeSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { officeName, latitude, longitude, radius } = req.body;
        const companyId = req.user!.companyId!;

        // Cari dulu apakah data kantor sudah ada
        const existingOffice = await prisma.officeSetting.findFirst({
            where: { companyId: Number(companyId) }
        });

        let office;
        if (existingOffice) {
            // Update jika ada
            office = await prisma.officeSetting.update({
                where: { id: existingOffice.id },
                data: { officeName, latitude, longitude, radius: Number(radius) }
            });
        } else {
            // Create jika tidak ada
            office = await prisma.officeSetting.create({
                data: {
                    companyId: Number(companyId),
                    officeName,
                    latitude,
                    longitude,
                    radius: Number(radius)
                }
            });
        }

        return res.json({ success: true, message: "Lokasi kantor diperbarui", data: office });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. UPDATE ATTENDANCE TIME SETTINGS
 * Mengupdate jam masuk standar (Misal: 08:00)
 */
export const updateAttendanceTimeSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { clockInTime } = req.body;
        const companyId = req.user!.companyId!;

        // Gunakan upsert: Update jika name 'clockInTime' ada di company tersebut, jika tidak Create.
        const setting = await prisma.attendanceSetting.upsert({
            where: {
                companyId_name: {
                    companyId: Number(companyId),
                    name: "clockInTime"
                }
            },
            update: { value: clockInTime },
            create: {
                companyId: Number(companyId),
                name: "clockInTime",
                value: clockInTime
            }
        });

        return res.json({ success: true, message: "Jam kerja berhasil disimpan", data: setting });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};