// File: routes/hrmShift.routes.js
import express from "express";
import {
  createShift,
  listShifts,
  getShiftById,
  updateShift,
  deleteShift,
} from "../controller/hrmShift.controller.js";
export const hrmShiftRouter = express.Router();
hrmShiftRouter.post("/create/:database", createShift);
hrmShiftRouter.get("/list/:database", listShifts);
hrmShiftRouter.get("/view/:id/:database", getShiftById);
hrmShiftRouter.put("/update/:id/:database", updateShift);
hrmShiftRouter.delete("/delete/:id/:database", deleteShift);
export default hrmShiftRouter;
