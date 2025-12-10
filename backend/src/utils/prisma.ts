import { PrismaClient } from "@prisma/client";

// Simpan PrismaClient di global agar tidak membuat instance baru setiap kali reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

// Hanya simpan di global saat development
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
