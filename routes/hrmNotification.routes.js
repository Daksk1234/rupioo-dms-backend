// File: routes/hrmNotification.routes.js
import express from "express";
import { createNotification, listNotification, viewNotification, updateNotification, transitionNotification, deleteNotification, reportNotification } from "../controller/hrmNotification.controller.js";
const router = express.Router();
router.post("/create/:database", createNotification);
router.get("/list/:database", listNotification);
router.get("/view/:id/:database", viewNotification);
router.put("/update/:id/:database", updateNotification);
router.put("/transition/:id/:database", transitionNotification);
router.delete("/delete/:id/:database", deleteNotification);
router.get("/report/:database", reportNotification);
export default router;
