// File: routes/hrmJoining.routes.js
import express from "express";
import { createJoining, listJoining, viewJoining, updateJoining, transitionJoining, deleteJoining, reportJoining } from "../controller/hrmJoining.controller.js";
const router = express.Router();
router.post("/create/:database", createJoining);
router.get("/list/:database", listJoining);
router.get("/view/:id/:database", viewJoining);
router.put("/update/:id/:database", updateJoining);
router.put("/transition/:id/:database", transitionJoining);
router.delete("/delete/:id/:database", deleteJoining);
router.get("/report/:database", reportJoining);
export default router;
