// File: routes/hrmFace.routes.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createFace,
  listFaces,
  getFaceById,
  updateFace,
  deleteFace,
} from "../controller/hrmFace.controller.js";
export const hrmFaceRouter = express.Router();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "public/Images/";
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + fileExtension);
  },
});
export const upload = multer({ storage: storage });
hrmFaceRouter.post("/create/:database", upload.single("faceImage"), createFace);
hrmFaceRouter.get("/list/:database", listFaces);
hrmFaceRouter.get("/view/:id/:database", getFaceById);
hrmFaceRouter.put(
  "/update/:id/:database",
  upload.single("faceImage"),
  updateFace,
);
hrmFaceRouter.delete("/delete/:id/:database", deleteFace);
export default hrmFaceRouter;
