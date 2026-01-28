import { Router } from "express";
import { Role } from "@prisma/client";
import * as superController from "../controllers/superadmin.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();
router.use(authenticate, authorizeRoles(Role.superadmin));

/**
 * 1. Platform Metrics & Analytics
 */
router.get("/metrics", superController.getPlatformMetrics);

/**
 * 2. Tenant Management (Perusahaan/Admin)
 */
router.get("/tenants", superController.getAllTenants);
router.get("/tenants/:id", superController.getTenantDetail); 
router.patch("/tenants/:id/status", superController.updateTenantStatus);
router.delete("/tenants/:companyId/terminate", superController.terminateTenantAccess); 

/**
 * 3. Master Plan Management (Product Catalog)
 */
router.get("/master-plans", superController.getMasterPlans);
router.post("/master-plans", superController.upsertMasterPlan); 

/**
 * 4. Billing, Financial Audit & Manual Action
 */
router.get("/billing/transactions", superController.getAllSystemTransactions);
router.post("/billing/transactions/:transactionId/activate-manual", superController.manualTransactionActivation);

/**
 * 5. Subscription Management
 */
router.patch("/tenants/:companyId/subscription", superController.updateSubscription);

/**
 * 6. System Operations
 */
router.post("/operations/seed-plans", superController.seedDefaultPlans);

export default router; 