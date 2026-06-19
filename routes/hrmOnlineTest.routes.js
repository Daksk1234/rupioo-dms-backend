// File: routes/hrmOnlineTest.routes.js
import express from "express";
import { createOnlineTest, listOnlineTest, viewOnlineTest, updateOnlineTest, transitionOnlineTest, deleteOnlineTest, reportOnlineTest } from "../controller/hrmOnlineTest.controller.js";
const router = express.Router();
router.post("/create/:database", createOnlineTest);
router.get("/list/:database", listOnlineTest);
router.get("/view/:id/:database", viewOnlineTest);
router.put("/update/:id/:database", updateOnlineTest);
router.put("/transition/:id/:database", transitionOnlineTest);
router.delete("/delete/:id/:database", deleteOnlineTest);
router.get("/report/:database", reportOnlineTest);
export default router;
