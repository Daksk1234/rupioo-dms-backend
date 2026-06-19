// File: routes/hrmPerformance.routes.js
import express from "express";
import { createPerformance, listPerformance, viewPerformance, updatePerformance, transitionPerformance, deletePerformance, reportPerformance } from "../controller/hrmPerformance.controller.js";
const router = express.Router();
router.post("/create/:database", createPerformance);
router.get("/list/:database", listPerformance);
router.get("/view/:id/:database", viewPerformance);
router.put("/update/:id/:database", updatePerformance);
router.put("/transition/:id/:database", transitionPerformance);
router.delete("/delete/:id/:database", deletePerformance);
router.get("/report/:database", reportPerformance);
export default router;
