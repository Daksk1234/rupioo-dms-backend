import mongoose from "mongoose";

const deviceAccessLogSchema = new mongoose.Schema(
  {
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegisteredDevice",
    },
    deviceKeyHash: { type: String },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    email: { type: String },

    ipAddress: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    userAgent: { type: String },

    result: {
      type: String,
      enum: ["ALLOWED", "DENIED"],
      required: true,
    },
    reason: { type: String }, // e.g. MISSING_DEVICE_KEY, IP_MISMATCH, BLOCKED_DEVICE

    meta: { type: Object },
  },
  { timestamps: true }
);

export default mongoose.model("DeviceAccessLog", deviceAccessLogSchema);
