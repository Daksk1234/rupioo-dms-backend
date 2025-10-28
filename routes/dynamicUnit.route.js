import express from "express"
import { deleteDynamicUnit, saveDynamicUnit, viewDynamicUnit } from "../controller/dynamicUnit.controller.js";
const router = express.Router();
router.post("/save-unit", saveDynamicUnit)
router.get("/view-unit/:database", viewDynamicUnit)
router.delete("/delete-unit/:id/:innerId", deleteDynamicUnit)
export default router;