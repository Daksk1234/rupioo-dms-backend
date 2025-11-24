// File: model/ActivityLog.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const ActivityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },

    name: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    ip: {
      type: String,
      default: "",
    },

    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    city: {
      type: String,
      default: "",
    },

    state: {
      type: String,
      default: "",
    },

    // ✅ NEW FIELD
    pincode: {
      type: String,
      default: "",
    },

    // ua: {
    //   type: String,
    //   default: "",
    // },

    // device: {
    //   type: String,
    //   default: "",
    // },

    loginAt: {
      type: Date,
      required: true,
    },

    logoutAt: {
      type: Date,
      required: true,
    },

    // hitCount: {
    //   type: Number,
    //   default: 0,
    // },

    // methodLast: {
    //   type: String,
    //   default: "",
    // },

    // pathLast: {
    //   type: String,
    //   default: "",
    // },

    statusLast: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

ActivityLogSchema.index({ loginAt: -1 });
ActivityLogSchema.index({ userId: 1 });
ActivityLogSchema.index({ ip: 1 });

const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema);

export default ActivityLog;
