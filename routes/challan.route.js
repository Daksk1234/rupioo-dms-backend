// routes/challan.routes.js
import express from "express";
import {
  createChallan,
  listChallans,
  getChallanById,
  updateChallan,
  updateChallanStatus,
  deleteChallan,
} from "../controller/challan.controller.js";

const router = express.Router();

router.post("/", createChallan);
router.get("/:id", getChallanById);
router.get("/list/:userId/:database", listChallans);
router.put("/:id", updateChallan);
router.post("/:id/status", updateChallanStatus);
router.delete("/:id", deleteChallan);

export default router;
