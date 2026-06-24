import express from "express";
import {
  generateSupportCode,
  verifySupportCode,
} from "../controller/supportCode.controller.js";

const router = express.Router();

router.post("/generate", generateSupportCode);
router.post("/verify", verifySupportCode);

export default router;
