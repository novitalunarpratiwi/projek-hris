import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import fs from "fs";
import path from "path";

/**
 * 1. GET COMPANY PROFILE
 * Akses: Semua Role (Superadmin, Admin, Employee)
 * Digunakan untuk menampilkan informasi dasar perusahaan di Dashboard.
 */
export const getCompanyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;

        if (!companyId) {
            return res.status(404).json({ success: false, message: "Perusahaan tidak ditemukan (System User)" });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: {
                    select: { users: true } // Menghitung total karyawan aktif
                },
                subscription: true // Info paket untuk admin
            }
        });

        if (!company) {
            return res.status(404).json({ success: false, message: "Data perusahaan tidak ditemukan" });
        }

        return res.json({ success: true, data: company });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. UPDATE COMPANY
 * Akses: Khusus Admin
 */
export const updateCompany = async (req: AuthRequest, res: Response) => {
    try {
        const { name, address, domain } = req.body;
        const companyId = req.user!.companyId!;

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: {
                name,
                address,
                domain
            }
        });

        // Catat di Audit Log jika perlu
        await prisma.auditLog.create({
            data: {
                companyId,
                userId: req.user!.id,
                action: "UPDATE_COMPANY_INFO",
                details: `Mengubah data profil perusahaan.`
            }
        });

        return res.json({ 
            success: true, 
            message: "Profil perusahaan berhasil diperbarui", 
            data: updated 
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. UPLOAD LOGO
 * Akses: Khusus Admin
 */
export const uploadLogo = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Tidak ada file logo yang diunggah" });
        }

        const companyId = req.user!.companyId!;
        const company = await prisma.company.findUnique({ where: { id: companyId } });

        // LOGIKA: Hapus logo lama dari storage jika ada agar tidak menumpuk sampah
        if (company?.logo) {
            const oldLogoPath = path.join(process.cwd(), "public/logos", company.logo);
            if (fs.existsSync(oldLogoPath)) {
                fs.unlinkSync(oldLogoPath);
            }
        }

        // Update nama file logo baru di database
        const updated = await prisma.company.update({
            where: { id: companyId },
            data: { logo: req.file.filename }
        });

        return res.json({ 
            success: true, 
            message: "Logo perusahaan berhasil diperbarui", 
            data: updated.logo 
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};