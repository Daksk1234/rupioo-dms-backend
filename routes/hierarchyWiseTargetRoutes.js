// File: routes/hierarchyWiseTargetRoutes.js
import e from "express";
const router = e.Router();

import {
  getOverrides,
  upsertOverride,
  clearEntityOverrides,
  clearEntityMonthOverrides,
  bulkUpsertAllocations,
  getAllocations,
} from "../controller/hierarchyWiseTargetController.js";

// overrides
router.get("/overrides", getOverrides);
router.post("/overrides/upsert", upsertOverride);
router.delete("/overrides/:roleKey/:entityId", clearEntityOverrides);
router.delete(
  "/overrides/:roleKey/:entityId/:monthLabel",
  clearEntityMonthOverrides,
);

// allocations snapshots (saved final results for everyone)
router.post("/allocations/bulk-upsert", bulkUpsertAllocations);
router.get("/allocations", getAllocations);

export default router;
