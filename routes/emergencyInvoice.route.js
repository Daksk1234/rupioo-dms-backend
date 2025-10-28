import express from "express"
import { saveEmergencyInvoice, updateEmergencyInvoice, viewEmergencyInvoice } from "../controller/emergencyInvoice.controller.js";
const router=express.Router();

router.post("/save-invoice",saveEmergencyInvoice)
router.get("/view-invoice/:database",viewEmergencyInvoice)
router.put("/update-invoice/:id",updateEmergencyInvoice)

export default router