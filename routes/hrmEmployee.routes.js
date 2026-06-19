// File: routes/hrmEmployee.routes.js
import express from "express";
import { createEmployee, deleteEmployee, getEmployeeById, listEmployees, updateEmployee } from "../controller/hrmEmployee.controller.js";
const router=express.Router();
router.post("/create/:database",createEmployee);
router.get("/list/:database",listEmployees);
router.get("/view/:id/:database",getEmployeeById);
router.put("/update/:id/:database",updateEmployee);
router.delete("/delete/:id/:database",deleteEmployee);
export default router;
