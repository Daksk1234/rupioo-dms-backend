// File: routes/hrmAttendance.routes.js

import express from "express";
import {
  createAttendance,
  listAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
} from "../controller/hrmAttendance.controller.js";

export const hrmAttendanceRouter = express.Router();

hrmAttendanceRouter.post("/create/:database", createAttendance);
hrmAttendanceRouter.get("/list/:database", listAttendance);
hrmAttendanceRouter.get("/view/:id/:database", getAttendanceById);
hrmAttendanceRouter.put("/update/:id/:database", updateAttendance);
hrmAttendanceRouter.delete("/delete/:id/:database", deleteAttendance);

export default hrmAttendanceRouter;
