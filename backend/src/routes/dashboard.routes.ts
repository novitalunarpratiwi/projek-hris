import { Router, Request, Response } from "express";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

// Endpoint dashboard (protected)
router.get("/dashboard", authenticate, (req: Request, res: Response) => {
  res.json({
    message: "Berhasil masuk Dashboard 🎉",
    user: req.user
  });
});

export default router;
