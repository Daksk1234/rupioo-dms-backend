import e from "express";
const router = e.Router();

import {
  getCompanySalesTarget,
  upsertCompanySalesTarget,
} from "../controller/companySalesTargetController.controller.js";

router.get("/", getCompanySalesTarget);
router.post("/upsert", upsertCompanySalesTarget);

export default router;
