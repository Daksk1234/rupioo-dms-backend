// File: routes/hrmExpense.routes.js
import express from "express";
import { createExpense, listExpense, viewExpense, updateExpense, transitionExpense, deleteExpense, reportExpense } from "../controller/hrmExpense.controller.js";
const router = express.Router();
router.post("/create/:database", createExpense);
router.get("/list/:database", listExpense);
router.get("/view/:id/:database", viewExpense);
router.put("/update/:id/:database", updateExpense);
router.put("/transition/:id/:database", transitionExpense);
router.delete("/delete/:id/:database", deleteExpense);
router.get("/report/:database", reportExpense);
export default router;
