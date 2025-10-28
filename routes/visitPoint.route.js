import express from "express";
import { createVisitPoint, updateVisitPoint, viewVisitPoint } from "../controller/visitPoint.controller.js";
const router=express.Router();

router.post("/create-visitpoint",createVisitPoint)
router.get("/view-visitpoint/:id/:date",viewVisitPoint)
router.put("/update-visit/:id",updateVisitPoint)
export default router;