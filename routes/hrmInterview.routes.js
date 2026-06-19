// File: routes/hrmInterview.routes.js
import express from "express";
import { createInterview, listInterview, viewInterview, updateInterview, transitionInterview, deleteInterview, reportInterview } from "../controller/hrmInterview.controller.js";
const router = express.Router();
router.post("/create/:database", createInterview);
router.get("/list/:database", listInterview);
router.get("/view/:id/:database", viewInterview);
router.put("/update/:id/:database", updateInterview);
router.put("/transition/:id/:database", transitionInterview);
router.delete("/delete/:id/:database", deleteInterview);
router.get("/report/:database", reportInterview);
export default router;
