// File: model/hrmDocument.model.js
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
  date: { type: String, default: "", index: true },
  month: { type: String, default: "", index: true },
  amount: { type: String, default: "" },
  status: { type: String, default: "Active", index: true },
  remarks: { type: String, default: "" },
  payload: { type: Object, default: {} }
}, { timestamps: true, strict: false });
schema.index({ database: 1, kind: 1, status: 1 });
export const HrmDocument = mongoose.models.hrmDocument || mongoose.model("hrmDocument", schema);
