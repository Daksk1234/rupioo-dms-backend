import express from "express";
import {
  createDevice,
  listDevices,
  updateDeviceStatus,
  deleteDevice,
  getDeviceLogs,
} from "../controller/device.controller.js";

// import { authMiddleware } from "../middleware/auth.js"; // your existing auth
// import { requireSuperAdmin } from "../middleware/roles.js"; // you probably have similar

const router = express.Router();

// All routes under /api/devices are SuperAdmin-only
// router.use(authMiddleware, requireSuperAdmin);

router.post("/create", createDevice);
router.get("/", listDevices);
router.patch("/status/:id", updateDeviceStatus);
router.delete("/delete/:id", deleteDevice);
router.get("/logs/:id", getDeviceLogs);

export default router;
