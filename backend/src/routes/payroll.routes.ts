import { Router } from "express";
import * as payrollController from "../controllers/payroll.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware"; // Jangan lupa proteksi langganan
import { Role } from "@prisma/client";

const router = Router();

router.use(authenticate);

// ==========================================
// 2. AKSES KARYAWAN (Self Service)
// ==========================================
router.get("/my-payrolls", payrollController.getMyPayrolls); 
router.get("/my-payrolls/:id", payrollController.getPayrollDetail);


// ==========================================
// 3. OPERASIONAL ADMIN (Generation & Bulk)
// ==========================================
const adminAccess = authorizeRoles(Role.admin);

// Ditambah checkSubscription karena ini fitur premium (SaaS)
router.post("/generate", adminAccess, checkSubscription, payrollController.generateMonthlyPayroll);
router.post("/calculate/:id", adminAccess, checkSubscription, payrollController.calculatePayroll);
router.post("/admin/approve-all", adminAccess, checkSubscription, payrollController.approveAllMonthly); 
router.post("/admin/bulk-payment", adminAccess, checkSubscription, payrollController.bulkPayment); 


// ==========================================
// 4. MANAGEMENT & MONITORING
// ==========================================
router.get("/admin/all", adminAccess, payrollController.getAllPayrolls);
router.patch("/update-status/:id", adminAccess, checkSubscription, payrollController.updatePayrollStatus);
router.delete("/delete/:id", adminAccess, checkSubscription, payrollController.deletePayroll);
router.get("/admin/stats", adminAccess, payrollController.getPayrollStats); 


// ==========================================
// 5. ROLE SUPERADMIN
// ==========================================
router.get("/system/all-logs", authorizeRoles(Role.superadmin), payrollController.getGlobalPayrollLogs);

export default router;