// File: routes/hrmHoliday.routes.js
import express from "express";
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from "../controller/hrmHoliday.controller.js";
const router=express.Router();
router.post("/create/:database",createHoliday);
router.get("/list/:database",listHolidays);
router.put("/update/:id/:database",updateHoliday);
router.delete("/delete/:id/:database",deleteHoliday);
export default router;
