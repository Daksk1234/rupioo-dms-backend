import express from "express";
import {
  createHrmEmployeeApp,
  deleteHrmEmployeeApp,
  markHrmEmployeeFaceRegistered,
  updateHrmEmployeeApp,
  viewHrmEmployeeAppById,
  viewHrmEmployeesApp,
} from "../controller/hrmEmployeesApp.controller.js";

const router = express.Router();

router.post("/create", createHrmEmployeeApp);
router.get("/view/:database", viewHrmEmployeesApp);
router.get("/view-one/:id", viewHrmEmployeeAppById);
router.put("/update/:id", updateHrmEmployeeApp);
router.put("/mark-face/:id", markHrmEmployeeFaceRegistered);
router.delete("/delete/:id", deleteHrmEmployeeApp);

export default router;
