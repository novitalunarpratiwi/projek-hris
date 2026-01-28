import { PrismaClient } from "@prisma/client";

/**
 * Mendeklarasikan tipe global agar TypeScript tidak komplain
 * saat kita menyimpan instance prisma di objek 'global'.
 */
declare global {
  var prisma: PrismaClient | undefined;
}

// Gunakan instance yang sudah ada di global atau buat baru jika belum ada
export const prisma =
  global.prisma ??
  new PrismaClient({
    // Aktifkan log hanya pada level tertentu agar console tidak terlalu berisik
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// Simpan instance ke global jika tidak sedang di lingkungan produksi
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;