import express from "express";
import cors, { CorsOptions } from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import morgan from "morgan"; 
import helmet from "helmet";
import rateLimit from "express-rate-limit"; 

dotenv.config();
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import userRoutes from "./routes/user.routes";
import attendanceRoutes from "./routes/attendance.routes"; 
import leaveRoutes from "./routes/leave.routes"; 
import positionRoutes from "./routes/position.routes";
import payrollRoutes from "./routes/payroll.routes";    
import companyRoutes from "./routes/company.routes";       
import superadminRoutes from "./routes/superadmin.routes"; 
import subscriptionRoutes from "./routes/subscription.routes";
import auditRoutes from "./routes/audit.routes";

const app = express();

// ============================================================
// 1. SECURITY & GLOBAL MIDDLEWARE
// ============================================================

// Aktifkan Helmet untuk keamanan Header
app.use(helmet({
    crossOriginResourcePolicy: false, // Penting agar gambar di /public bisa diakses frontend
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { success: false, message: "Terlalu banyak request dari IP ini, coba lagi nanti." }
});
app.use("/api", limiter); 
const corsOptions: CorsOptions = {
    origin: process.env.CLIENT_URL || '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};
app.use(cors(corsOptions)); 

app.use(morgan("dev")); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/public", express.static(path.join(process.cwd(), "public")));

// ============================================================
// 2. AUTO-CREATE STORAGE FOLDERS
// ============================================================
const folders = ["public/profiles", "public/logos", "public/attendance", "public/leaves"];
folders.forEach(folder => {
    const fullPath = path.join(process.cwd(), folder);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ============================================================
// 3. REGISTRASI RUTE API
// ============================================================
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes); 
app.use("/api/leaves", leaveRoutes); 
app.use("/api/payroll", payrollRoutes);  
app.use("/api/positions", positionRoutes);
app.use("/api/company", companyRoutes);       
app.use("/api/superadmin", superadminRoutes); 
app.use("/api/subscription", subscriptionRoutes); 
app.use("/api/audit", auditRoutes);

app.get("/", (req, res) => {
    res.json({ 
        status: "success", 
        message: "HRIS SaaS API is running 🚀",
        version: "1.0.0"
    });
});

// ============================================================
// 4. ERROR HANDLING
// ============================================================

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${req.method} ${req.url} => ${message}`);
    res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    ################################################
    🚀  Server HRIS berjalan di port ${PORT}
    🌐  API Base URL: http://localhost:${PORT}/api
    📁  Static URL: http://localhost:${PORT}/public
    ################################################
    `);
});