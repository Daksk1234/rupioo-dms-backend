import express from "express";
import {
  saveCombinedTarget,
  listCombinedTargets,
  updateCombinedTarget,
  deleteCombinedTarget,
  combinedTargetUpload,
} from "../controller/combinedTarget.controller.js";

const router = express.Router();

router.post("/", combinedTargetUpload, saveCombinedTarget);
router.post("/save", combinedTargetUpload, saveCombinedTarget);
router.get("/", listCombinedTargets);
router.put("/:id", updateCombinedTarget);
router.delete("/:id", deleteCombinedTarget);

export default router;
