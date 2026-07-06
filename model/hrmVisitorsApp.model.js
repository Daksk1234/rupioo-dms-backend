// File: models/hrmVisitorsApp.model.js
import mongoose from "mongoose";

const HrmVisitorsAppSchema = new mongoose.Schema(
  {
    database: { type: String, required: true, index: true },
    created_by: { type: String },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true },
    address: { type: String, trim: true },
    photoUri: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Deleted"],
      default: "Active",
      index: true,
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const HrmVisitorsApp =
  mongoose.models.HrmVisitorsApp ||
  mongoose.model("HrmVisitorsApp", HrmVisitorsAppSchema);

export default HrmVisitorsApp;
