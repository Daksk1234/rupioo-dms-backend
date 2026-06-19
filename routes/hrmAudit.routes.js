// File: routes/hrmAudit.routes.js
import express from "express";
import { createAudit, listAudit, viewAudit, updateAudit, transitionAudit, deleteAudit, reportAudit } from "../controller/hrmAudit.controller.js";
const router = express.Router();
router.post("/create/:database", createAudit);
router.get("/list/:database", listAudit);
router.get("/view/:id/:database", viewAudit);
router.put("/update/:id/:database", updateAudit);
router.put("/transition/:id/:database", transitionAudit);
router.delete("/delete/:id/:database", deleteAudit);
router.get("/report/:database", reportAudit);
export default router;
