// File: routes/hrmSecurity.routes.js
import express from "express";
import { createSecurity, listSecurity, viewSecurity, updateSecurity, deleteSecurity } from "../controller/hrmSecurity.controller.js";
const router = express.Router();
router.post("/create/:database", createSecurity);
router.get("/list/:database", listSecurity);
router.get("/view/:id/:database", viewSecurity);
router.put("/update/:id/:database", updateSecurity);
router.delete("/delete/:id/:database", deleteSecurity);
export default router;
