// File: models/HierarchyTargetOverride.js
import mongoose from "mongoose";

const HierarchyTargetOverrideSchema = new mongoose.Schema(
  {
    database: { type: String, required: true, index: true }, // tenant key
    fyStartYear: { type: Number, required: true, index: true }, // e.g. 2025 => FY 2025-26
    roleKey: { type: String, required: true, index: true }, // "salesperson" | "customer"
    entityId: { type: String, required: true, index: true }, // userId or customerId
    monthLabel: { type: String, required: true, index: true }, // "April-2025"
    productId: { type: String, required: true, index: true },
    qty: { type: Number, required: true, min: 0 },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

HierarchyTargetOverrideSchema.index(
  {
    database: 1,
    fyStartYear: 1,
    roleKey: 1,
    entityId: 1,
    monthLabel: 1,
    productId: 1,
  },
  { unique: true, name: "uniq_hwt_override" },
);

export const HierarchyTargetOverride = mongoose.model(
  "HierarchyTargetOverride",
  HierarchyTargetOverrideSchema,
);
