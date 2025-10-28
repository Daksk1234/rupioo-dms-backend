import express from "express"
import { addPlan, updatePlan, viewPlan } from "../controller/planRequest.controller.js";
import multer from "multer";
import path from "path"
const router = express.Router();
// const upload = multer({ dest: "public/Images" })
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/Images/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});
const upload = multer({ storage: storage });
router.post("/add-request",upload.single("file"),addPlan);
router.get("/view-request",viewPlan)
router.put("/update-status/:id",updatePlan)
export default router;