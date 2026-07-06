// File: routes/hrmAttendance.routes.js

import express from "express";
import {
  createAttendance,
  listAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  listSalaryMonthPayments,
  paySalaryMonth,
} from "../controller/hrmAttendance.controller.js";

export const hrmAttendanceRouter = express.Router();

hrmAttendanceRouter.post("/create/:database", createAttendance);
hrmAttendanceRouter.get("/list/:database", listAttendance);

// Salary/month payment routes must stay before /view/:id/:database routes.
hrmAttendanceRouter.get("/salary-payments/:database", listSalaryMonthPayments);
hrmAttendanceRouter.put("/salary-payment/:database/pay", paySalaryMonth);

hrmAttendanceRouter.get("/view/:id/:database", getAttendanceById);
hrmAttendanceRouter.put("/update/:id/:database", updateAttendance);
hrmAttendanceRouter.delete("/delete/:id/:database", deleteAttendance);

export default hrmAttendanceRouter;
