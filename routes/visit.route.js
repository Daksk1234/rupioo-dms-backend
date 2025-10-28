import express from "express";
import { createVisit, viewVisit } from "../controller/visit.controller.js";
const router=express.Router()

router.post("/save-visit",createVisit)
router.get("/view-visit/:id/:database",viewVisit)

export default router;