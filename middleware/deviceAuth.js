import crypto from "crypto";
import RegisteredDevice from "../model/RegisteredDevice.model.js";
import DeviceAccessLog from "../model/DeviceAccessLog.model.js";

const hashDeviceKey = (raw) =>
  crypto.createHash("sha256").update(String(raw)).digest("hex");

// set this true if you want IP to be EXACTLY the same as registered
const ENFORCE_IP_MATCH = true;

export const verifyDeviceForLogin = async (req, res, next) => {
  try {
    /* ================== NEW: bootstrap escape ================== */
    // If there are NO registered devices yet, don't enforce device lock.
    // This lets SuperAdmin log in the first time and register systems.
    const totalDevices = await RegisteredDevice.estimatedDocumentCount();
    if (!totalDevices) {
      return next();
    }
    /* ========================================================== */

    const deviceKey = req.headers["x-device-key"] || req.body.deviceKey || "";
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.ip ||
      "0.0.0.0";
    const userAgent = req.get("user-agent") || "unknown";

    const { latitude, longitude, email } = req.body || {};

    const cleanedKey = String(deviceKey || "").trim();
    const hashedKey = cleanedKey ? hashDeviceKey(cleanedKey) : null;

    let device = null;
    if (hashedKey) {
      device = await RegisteredDevice.findOne({
        deviceKeyHash: hashedKey,
      }).lean();
    }

    const log = new DeviceAccessLog({
      deviceId: device?._id,
      deviceKeyHash: hashedKey,
      email,
      ipAddress: ip,
      latitude,
      longitude,
      userAgent,
    });

    // 1) No deviceKey
    if (!hashedKey) {
      log.result = "DENIED";
      log.reason = "MISSING_DEVICE_KEY";
      await log.save();
      return res.status(403).json({
        code: "MISSING_DEVICE_KEY",
        message:
          "This system is not activated. Please contact SuperAdmin to register this device.",
      });
    }

    // 2) Not registered or blocked
    if (!device || device.status !== "ACTIVE") {
      log.result = "DENIED";
      log.reason = device ? "DEVICE_BLOCKED" : "DEVICE_NOT_REGISTERED";
      await log.save();
      return res.status(403).json({
        code: "DEVICE_NOT_AUTHORISED",
        message:
          "This system is not authorised. Please contact SuperAdmin to register/enable this device.",
      });
    }

    // 3) IP check (optional strict)
    if (ENFORCE_IP_MATCH && device.ipAddress && device.ipAddress !== ip) {
      log.result = "DENIED";
      log.reason = "IP_MISMATCH";
      await log.save();
      return res.status(403).json({
        code: "IP_MISMATCH",
        message:
          "IP address does not match the registered system. Access denied.",
      });
    }

    // 4) All good → mark allowed
    log.result = "ALLOWED";
    log.reason = "OK";
    await log.save();

    await RegisteredDevice.findByIdAndUpdate(device._id, {
      lastSeenAt: new Date(),
      lastSeenIp: ip,
    });

    req.device = device;
    next();
  } catch (err) {
    console.error("verifyDeviceForLogin error:", err);
    return res.status(500).json({
      code: "DEVICE_CHECK_ERROR",
      message: "Error while verifying device. Please try again.",
    });
  }
};
