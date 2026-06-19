// File: routes/hrmRecruitment.routes.js
import express from "express";
import { createRecruitment, listRecruitment, viewRecruitment, updateRecruitment, transitionRecruitment, deleteRecruitment, reportRecruitment } from "../controller/hrmRecruitment.controller.js";
const router = express.Router();
router.post("/create/:database", createRecruitment);
router.get("/list/:database", listRecruitment);
router.get("/view/:id/:database", viewRecruitment);
router.put("/update/:id/:database", updateRecruitment);
router.put("/transition/:id/:database", transitionRecruitment);
router.delete("/delete/:id/:database", deleteRecruitment);
router.get("/report/:database", reportRecruitment);
export default router;
