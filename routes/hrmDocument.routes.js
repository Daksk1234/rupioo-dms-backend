// File: routes/hrmDocument.routes.js
import express from "express";
import { createDocument, listDocument, viewDocument, updateDocument, deleteDocument } from "../controller/hrmDocument.controller.js";
const router = express.Router();
router.post("/create/:database", createDocument);
router.get("/list/:database", listDocument);
router.get("/view/:id/:database", viewDocument);
router.put("/update/:id/:database", updateDocument);
router.delete("/delete/:id/:database", deleteDocument);
export default router;
