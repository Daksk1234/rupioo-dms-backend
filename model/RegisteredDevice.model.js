import mongoose from "mongoose";

const registeredDeviceSchema = new mongoose.Schema(
  {
    systemName: { type: String, required: true }, // e.g. "Accounts-PC-1"

    osSerialNumber: { type: String }, // manual
    systemNumber: { type: String }, // CPU / asset tag, manual

    ipAddress: { type: String }, // optional fixed IP
    latitude: { type: Number },
    longitude: { type: Number },

    deviceKeyHash: { type: String, required: true, index: true }, // sha256(deviceKey)

    userAgentSnapshot: { type: String }, // first UA used

    // Who registered this system
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    registeredByName: { type: String },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
      index: true,
    },

    notes: { type: String },

    lastSeenAt: { type: Date },
    lastSeenIp: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("RegisteredDevice", registeredDeviceSchema);
