import mongoose from "mongoose";

const CompanySalesTargetSchema = new mongoose.Schema(
  {
    database: { type: String, required: true, index: true },
    fy: { type: String, required: true, index: true },

    // store full structures
    yearPlan: { type: mongoose.Schema.Types.Mixed, default: {} },
    monthPlans: { type: mongoose.Schema.Types.Mixed, default: {} },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

CompanySalesTargetSchema.index({ database: 1, fy: 1 }, { unique: true });

export const CompanySalesTarget = mongoose.model(
  "CompanySalesTarget",
  CompanySalesTargetSchema,
);
