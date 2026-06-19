// File: routes/hrmOffer.routes.js
import express from "express";
import { createOffer, listOffer, viewOffer, updateOffer, transitionOffer, deleteOffer, reportOffer } from "../controller/hrmOffer.controller.js";
const router = express.Router();
router.post("/create/:database", createOffer);
router.get("/list/:database", listOffer);
router.get("/view/:id/:database", viewOffer);
router.put("/update/:id/:database", updateOffer);
router.put("/transition/:id/:database", transitionOffer);
router.delete("/delete/:id/:database", deleteOffer);
router.get("/report/:database", reportOffer);
export default router;
