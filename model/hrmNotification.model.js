// File: model/hrmNotification.model.js
import mongoose from "mongoose";
const schema = new mongoose.Schema({

  database: { type: String, required: true, index: true, trim: true },
  kind: { type: String, default: "main", index: true },
  title: { type: String, default: "" },
  name: { type: String, default: "" },
  employeeName: { type: String, default: "" },
  candidateName: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  panNumber: { type: String, default: "", uppercase: true, trim: true },
  mobile: { type: String, default: "" },
  email: { type: String, default: "" },
  department: { type: String, default: "" },
  designation: { type: String, default: "" },
  date: { type: String, default: "", index: true },
  month: { type: String, default: "", index: true },
  stage: { type: String, default: "" },
  amount: { type: String, default: "" },
  score: { type: Number, default: 0 },
  status: { type: String, default: "Active", index: true },
  remarks: { type: String, default: "" },
  history: { type: Array, default: [] },
  payload: { type: Object, default: {} },

}, { timestamps: true, strict: false });
schema.index({ database: 1, kind: 1, status: 1 });
schema.index({ database: 1, date: 1, status: 1 });
schema.index({ database: 1, month: 1, status: 1 });
export const HrmNotification = mongoose.models.hrmNotification || mongoose.model("hrmNotification", schema);
