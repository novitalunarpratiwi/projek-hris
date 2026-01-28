import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { Role, UserStatus, ContractType } from "@prisma/client";

/**
 * ==========================================
 * 1. SELF SERVICE LOGIC (Profil Mandiri)
 * ==========================================
 */

export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: "Sesi habis" });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { 
                position: { select: { positionName: true } },
                company: { select: { name: true, logo: true } }
            }
        });

        if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

        const { password, ...userData } = user;
        return res.json({ success: true, data: userData });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { name, phone, bank_account, bank_name, bank_holder_name, gender } = req.body;
        const updateData: any = { name, phone, bank_account, bank_name, bank_holder_name, gender };
        
        if (req.file) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user?.profile_image) {
                const oldPath = path.join(process.cwd(), "public/profiles", user.profile_image);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            updateData.profile_image = req.file.filename;
        }

        await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        return res.json({ success: true, message: "Profil berhasil diperbarui" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { oldPassword, newPassword } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(400).json({ success: false, message: "Password lama salah" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        return res.json({ success: true, message: "Password berhasil diganti" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId || !req.file) return res.status(400).json({ success: false, message: "Data tidak lengkap" });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.profile_image) {
            const oldPath = path.join(process.cwd(), "public/profiles", user.profile_image);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        await prisma.user.update({
            where: { id: userId },
            data: { profile_image: req.file.filename }
        });

        return res.json({ success: true, message: "Foto profil berhasil diperbarui" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * 2. ADMIN MANAGEMENT LOGIC (Kelola Karyawan)
 * ==========================================
 */

export const getPositions = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Company ID missing" });

        const positions = await prisma.positionSalary.findMany({
            where: { companyId: Number(companyId) },
            orderBy: { positionName: 'asc' }
        });
        return res.json({ success: true, data: positions });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Company ID missing" });

        const users = await prisma.user.findMany({
            where: { companyId: Number(companyId) },
            include: { position: { select: { positionName: true } } },
            orderBy: { name: 'asc' }
        });
        return res.json({ success: true, data: users });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const user = await prisma.user.findFirst({
            where: { id: Number(req.params.id), companyId: Number(companyId) },
            include: { position: true }
        });
        if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        
        const { password, ...userData } = user;
        return res.json({ success: true, data: userData });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createUser = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        const adminId = req.user?.id;
        if (!companyId || !adminId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { 
            name, email, password, role, positionId, employeeId, 
            annual_leave_quota, join_date, contract_type,
            bank_name, bank_account, bank_holder_name, phone, gender
        } = req.body;

        if (role === Role.superadmin) return res.status(403).json({ message: "Forbidden" });

        const exist = await prisma.user.findFirst({
            where: { companyId: Number(companyId), OR: [{ email }, { employeeId }] }
        });
        if (exist) return res.status(400).json({ message: "Email atau NIK sudah terdaftar" });

        const profile_image = req.file ? req.file.filename : null;
        const hashedPassword = await bcrypt.hash(password || "123456", 10);

        await prisma.user.create({
            data: {
                name, email, password: hashedPassword,
                role: (role as Role) || Role.employee,
                employeeId, phone, gender,
                companyId: Number(companyId),
                positionId: positionId ? Number(positionId) : null,
                annual_leave_quota: Number(annual_leave_quota) || 12,
                leave_balance: Number(annual_leave_quota) || 12,
                join_date: join_date ? new Date(join_date) : new Date(),
                contract_type: (contract_type as ContractType) || ContractType.Kontrak,
                bank_name, bank_account, bank_holder_name, profile_image
            }
        });

        await prisma.auditLog.create({
            data: { companyId: Number(companyId), userId: adminId, action: "CREATE_USER", details: `Mendaftarkan karyawan: ${email}` }
        });

        return res.status(201).json({ success: true, message: "Karyawan berhasil didaftarkan" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { id } = req.params;
        const data = req.body;

        const target = await prisma.user.findFirst({ 
            where: { id: Number(id), companyId: Number(companyId) } 
        });
        if (!target) return res.status(404).json({ message: "User not found" });

        let profile_image = target.profile_image;
        if (req.file) {
            if (target.profile_image) {
                const oldPath = path.join(process.cwd(), "public/profiles", target.profile_image);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            profile_image = req.file.filename;
        }

        const newQuota = data.annual_leave_quota ? Number(data.annual_leave_quota) : target.annual_leave_quota;
        const diff = newQuota - target.annual_leave_quota;

        await prisma.user.update({
            where: { id: Number(id) },
            data: {
                name: data.name,
                role: data.role as Role,
                status: data.status as UserStatus,
                phone: data.phone,
                employeeId: data.employeeId,
                positionId: data.positionId ? Number(data.positionId) : null,
                annual_leave_quota: newQuota,
                leave_balance: target.leave_balance + diff,
                bank_name: data.bank_name,
                bank_account: data.bank_account,
                bank_holder_name: data.bank_holder_name,
                profile_image
            }
        });

        return res.json({ success: true, message: "Data diperbarui" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Unauthorized" });

        await prisma.user.update({
            where: { id: Number(req.params.id), companyId: Number(companyId) },
            data: { status: req.body.status as UserStatus }
        });
        return res.json({ success: true, message: "Status updated" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Unauthorized" });

        await prisma.user.update({
            where: { id: Number(req.params.id), companyId: Number(companyId) },
            data: { status: UserStatus.Inactive }
        });
        return res.json({ success: true, message: "User dinonaktifkan (Soft Delete)" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const adminResetPassword = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const hashedPassword = await bcrypt.hash(req.body.newPassword || "123456", 10);
        await prisma.user.update({
            where: { id: Number(req.params.id), companyId: Number(companyId) },
            data: { password: hashedPassword }
        });
        return res.json({ success: true, message: "Password reset success" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};