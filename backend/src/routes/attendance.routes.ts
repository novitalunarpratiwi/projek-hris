import { Router } from "express";
import { getAttendanceByUser, clockIn, clockOut } from "../controllers/attendance.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", authenticate, getAttendanceByUser);
router.post("/clock-in", authenticate, clockIn);
router.post("/clock-out", authenticate, clockOut);

export default router;
