// File: routes/hrmFieldTracking.routes.js
import express from "express";
import { createFieldTracking, listFieldTracking, viewFieldTracking, updateFieldTracking, transitionFieldTracking, deleteFieldTracking, reportFieldTracking } from "../controller/hrmFieldTracking.controller.js";
const router = express.Router();
router.post("/create/:database", createFieldTracking);
router.get("/list/:database", listFieldTracking);
router.get("/view/:id/:database", viewFieldTracking);
router.put("/update/:id/:database", updateFieldTracking);
router.put("/transition/:id/:database", transitionFieldTracking);
router.delete("/delete/:id/:database", deleteFieldTracking);
router.get("/report/:database", reportFieldTracking);
export default router;
