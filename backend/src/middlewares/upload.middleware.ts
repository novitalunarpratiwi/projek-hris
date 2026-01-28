import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subFolder = "others";
        
        if (file.fieldname === "profile_image") { 
            subFolder = "profiles";
        } else if (file.fieldname === "logo") { 
            subFolder = "logos"; 
        } else if (file.fieldname === "evidence") { 
            subFolder = "leaves"; 
        } else if (file.fieldname === "attendance_photo") {
            subFolder = "attendance";
        }

        const fullPath = path.join(process.cwd(), "public", subFolder);

        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

export const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|pdf/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Format file tidak didukung! Gunakan JPG, PNG, atau PDF."));
    }
});

export const uploadProfile = upload;
export const uploadLogo = upload;
export const uploadAttendance = upload;
export const uploadLeave = upload;

export default upload;