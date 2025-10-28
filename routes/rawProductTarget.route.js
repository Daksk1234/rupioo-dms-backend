import express from "express";
import {
  deleteTarget,
  saveTarget,
  updateTarget,
  viewAllTarget,
  viewByIdTarget,
} from "../controller/rawProductTarget.controller.js";
const router = express.Router();

router.post("/save", saveTarget);
router.get("/view/:database", viewAllTarget);
router.get("/view-by-id/:id/:innerId", viewByIdTarget);
router.put("/update-target/:id/:innerId", updateTarget);
router.delete("/delete-target/:id/:innerId", deleteTarget);
export default router;
