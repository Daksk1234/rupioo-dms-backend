// File: routes/hrmPayrollRule.routes.js
import express from "express";
import { createPayrollRule, listPayrollRule, viewPayrollRule, updatePayrollRule, deletePayrollRule } from "../controller/hrmPayrollRule.controller.js";
const router = express.Router();
router.post("/create/:database", createPayrollRule);
router.get("/list/:database", listPayrollRule);
router.get("/view/:id/:database", viewPayrollRule);
router.put("/update/:id/:database", updatePayrollRule);
router.delete("/delete/:id/:database", deletePayrollRule);
export default router;
