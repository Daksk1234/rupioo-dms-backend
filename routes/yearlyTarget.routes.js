import express from "express";
import {
  createYearlyTarget,
  listYearlyTargets,
  viewYearlyTarget,
  updateYearlyTarget,
  updateYearlyTargetMonth,
  deleteYearlyTarget,
} from "../controller/yearlyTarget.controller.js";

const router = express.Router();

router.post("/create", createYearlyTarget);
router.get("/list/:database", listYearlyTargets);
router.get("/view/:id/:database", viewYearlyTarget);
router.put("/update/:id", updateYearlyTarget);
router.put("/update-month/:id", updateYearlyTargetMonth);
router.delete("/delete/:id/:database", deleteYearlyTarget);

export default router;
