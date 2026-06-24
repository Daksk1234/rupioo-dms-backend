// File: routes/hrmVisitorsApp.routes.js

import express from "express";
import {
  createHrmVisitorApp,
  viewHrmVisitorsApp,
  updateHrmVisitorApp,
  deleteHrmVisitorApp,
} from "../controller/hrmVisitorsApp.controller.js";

const router = express.Router();

router.post("/create", createHrmVisitorApp);
router.get("/view/:database", viewHrmVisitorsApp);
router.put("/update/:id", updateHrmVisitorApp);
router.delete("/delete/:id", deleteHrmVisitorApp);

export default router;
