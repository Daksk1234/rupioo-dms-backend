// File: routes/leave.routes.js

import express from "express";
import {
  approveLeaveRequest,
  cancelActiveLeaveForAttendance,
  createLeave,
  createLeaveRequest,
  deleteLeave,
  getActiveLeaveForAttendance,
  getLeaveRequests,
  getLeaves,
  rejectLeaveRequest,
  superApproveLeaveRequest,
  updateLeave,
} from "../controller/leave.controller.js";

const router = express.Router();

router.post("/request/:db", createLeaveRequest);
router.get("/requests/:db", getLeaveRequests);
router.patch("/requests/:id/:db/approve", approveLeaveRequest);
router.patch("/requests/:id/:db/reject", rejectLeaveRequest);
router.patch("/requests/:id/:db/super-approve", superApproveLeaveRequest);

router.get("/active/:db/:userId", getActiveLeaveForAttendance);
router.patch("/cancel-active/:db/:userId", cancelActiveLeaveForAttendance);

router.post("/:db", createLeave);
router.get("/:db", getLeaves);
router.put("/:id/:db", updateLeave);
router.delete("/:id/:db", deleteLeave);

export default router;
