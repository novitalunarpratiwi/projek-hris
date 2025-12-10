import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes"; 
import attendanceRoutes from "./routes/attendance.routes"
dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", dashboardRoutes); // 2. Route dashboard ditambahkan di sini
app.use("/api/attendance", attendanceRoutes);

app.listen(5000, () => console.log("Server running on port 5000 🚀"));