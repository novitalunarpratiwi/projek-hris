/*
  Warnings:

  - You are about to drop the column `check_in_time` on the `attendance` table. All the data in the column will be lost.
  - You are about to drop the column `check_out_time` on the `attendance` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `attendance` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `attendance` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(2))` to `Enum(EnumId(1))`.
  - You are about to drop the column `end_date` on the `leave` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `leave` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `leave` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `leave` table. All the data in the column will be lost.
  - The values [Maternity,Others] on the enum `Leave_type` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[userId,date]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endDate` to the `Leave` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Leave` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Leave` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Leave` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `attendance` DROP FOREIGN KEY `Attendance_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `leave` DROP FOREIGN KEY `Leave_user_id_fkey`;

-- DropIndex
DROP INDEX `Attendance_user_id_date_key` ON `attendance`;

-- AlterTable
ALTER TABLE `attendance` DROP COLUMN `check_in_time`,
    DROP COLUMN `check_out_time`,
    DROP COLUMN `user_id`,
    ADD COLUMN `clockIn` DATETIME(3) NULL,
    ADD COLUMN `clockOut` DATETIME(3) NULL,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `userId` INTEGER NOT NULL,
    MODIFY `date` DATETIME(3) NOT NULL,
    MODIFY `status` ENUM('OnTime', 'Late', 'Absent') NOT NULL;

-- AlterTable
ALTER TABLE `leave` DROP COLUMN `end_date`,
    DROP COLUMN `reason`,
    DROP COLUMN `start_date`,
    DROP COLUMN `user_id`,
    ADD COLUMN `endDate` DATETIME(3) NOT NULL,
    ADD COLUMN `startDate` DATETIME(3) NOT NULL,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    ADD COLUMN `userId` INTEGER NOT NULL,
    MODIFY `type` ENUM('Annual', 'Sick', 'Unpaid') NOT NULL,
    ALTER COLUMN `status` DROP DEFAULT;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `last_login` DATETIME(3) NULL,
    ADD COLUMN `profile_image` VARCHAR(191) NULL,
    ADD COLUMN `reset_token_expired` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    MODIFY `annual_leave_quota` INTEGER NOT NULL DEFAULT 12;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Attendance_userId_date_key` ON `Attendance`(`userId`, `date`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Leave` ADD CONSTRAINT `Leave_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
