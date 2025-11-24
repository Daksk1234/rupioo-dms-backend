import RegisteredDevice from "../model/RegisteredDevice.model.js";
import DeviceAccessLog from "../model/DeviceAccessLog.model.js";
import crypto from "crypto";

const hashDeviceKey = (raw) =>
  crypto.createHash("sha256").update(String(raw)).digest("hex");

// POST /api/devices  (SuperAdmin only)
export const createDevice = async (req, res) => {
  try {
    const {
      systemName,
      osSerialNumber,
      systemNumber,
      ipAddress,
      latitude,
      longitude,
      deviceKey, // raw key from form
      notes,
    } = req.body;

    if (!systemName || !deviceKey) {
      return res
        .status(400)
        .json({ message: "systemName and deviceKey are required." });
    }

    const deviceKeyHash = hashDeviceKey(deviceKey);

    const exists = await RegisteredDevice.findOne({ deviceKeyHash });
    if (exists) {
      return res
        .status(400)
        .json({ message: "Device with this key already registered." });
    }

    const user = req.user; // assuming you attach user in auth middleware

    const device = await RegisteredDevice.create({
      systemName,
      osSerialNumber,
      systemNumber,
      ipAddress,
      latitude,
      longitude,
      deviceKeyHash,
      notes,
      registeredBy: user?._id,
      registeredByName: user?.name,
    });

    return res.status(201).json(device);
  } catch (err) {
    console.error("createDevice error:", err);
    return res.status(500).json({ message: "Failed to create device." });
  }
};

// GET /api/devices?search=...
export const listDevices = async (req, res) => {
  try {
    const { search } = req.query;
    const q = {};

    if (search) {
      q.$or = [
        { systemName: new RegExp(search, "i") },
        { osSerialNumber: new RegExp(search, "i") },
        { systemNumber: new RegExp(search, "i") },
        { ipAddress: new RegExp(search, "i") },
        { registeredByName: new RegExp(search, "i") },
      ];
    }

    const devices = await RegisteredDevice.find(q)
      .sort({ createdAt: -1 })
      .lean();

    return res.json(devices);
  } catch (err) {
    console.error("listDevices error:", err);
    return res.status(500).json({ message: "Failed to list devices." });
  }
};

// PATCH /api/devices/:id/status
export const updateDeviceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["ACTIVE", "BLOCKED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const device = await RegisteredDevice.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!device) return res.status(404).json({ message: "Device not found" });

    return res.json(device);
  } catch (err) {
    console.error("updateDeviceStatus error:", err);
    return res.status(500).json({ message: "Failed to update device." });
  }
};

// DELETE /api/devices/:id
export const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await RegisteredDevice.findByIdAndDelete(id);
    if (!device) return res.status(404).json({ message: "Device not found" });

    return res.json({ message: "Device deleted" });
  } catch (err) {
    console.error("deleteDevice error:", err);
    return res.status(500).json({ message: "Failed to delete device." });
  }
};

// GET /api/devices/:id/logs
export const getDeviceLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await DeviceAccessLog.find({ deviceId: id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json(logs);
  } catch (err) {
    console.error("getDeviceLogs error:", err);
    return res.status(500).json({ message: "Failed to fetch logs." });
  }
};
