// File: model/hrmHalfDay.model.js
import mongoose from "mongoose";
const hrmHalfDaySchema = new mongoose.Schema(
  {
    database: { type: String, required: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    faceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    nameSnapshot: { type: String, default: "" },
    panNumber: { type: String, default: "" },
    date: { type: String, required: true, index: true },
    reason: { type: String, default: "" },
    source: {
      type: String,
      enum: [
        "Manual Checkbox",
        "Late Attendance",
        "Approved Request",
        "Early Out",
      ],
      default: "Manual Checkbox",
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Deleted"],
      default: "Pending",
    },
    completedAt: { type: String, default: "" },
  },
  { timestamps: true },
);
export const HrmHalfDay =
  mongoose.models.hrmHalfDay || mongoose.model("hrmHalfDay", hrmHalfDaySchema);
