// File: routes/hrmPermission.routes.js
import express from "express";
import { createPermission, listPermission, viewPermission, updatePermission, transitionPermission, deletePermission, reportPermission } from "../controller/hrmPermission.controller.js";
const router = express.Router();
router.post("/create/:database", createPermission);
router.get("/list/:database", listPermission);
router.get("/view/:id/:database", viewPermission);
router.put("/update/:id/:database", updatePermission);
router.put("/transition/:id/:database", transitionPermission);
router.delete("/delete/:id/:database", deletePermission);
router.get("/report/:database", reportPermission);
export default router;
