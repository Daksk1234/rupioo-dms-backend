import express from "express";
const router = express.Router();
import {
  createSalesPersonTarget,
  listSalesPersonTargets,
  getSalesPersonTargetById,
  updateSalesPersonTarget,
  deleteSalesPersonTarget,
} from "../controller/salesPersonTarget.controller.js";
// const controller = require("../controller/salesPersonTarget.controller");

// POST /api/salesperson-target/save
router.post("/save", createSalesPersonTarget);

// GET /api/salesperson-target/list
router.get("/list", listSalesPersonTargets);

// GET /api/salesperson-target/:id
router.get("/:id", getSalesPersonTargetById);

// PUT /api/salesperson-target/update/:id
router.put("/update/:id", updateSalesPersonTarget);

// DELETE /api/salesperson-target/delete/:id
router.delete("/delete/:id", deleteSalesPersonTarget);

export default router;
