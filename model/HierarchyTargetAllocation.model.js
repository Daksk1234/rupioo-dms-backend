// File: models/HierarchyTargetAllocation.js
import mongoose from "mongoose";
const ProductRowSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, default: "" },
    category: { type: String, default: "" },
    subCategory: { type: String, default: "" },
    profitColorCode: { type: String, default: "" },

    qty: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },

    // "BASE" | "EDIT" | "AUTO" | "SCALED" | "EDIT SCALED" | "AUTO SCALED"
    flag: { type: String, default: "BASE" },
  },
  { _id: false },
);

const HierarchyTargetAllocationSchema = new mongoose.Schema(
  {
    database: { type: String, required: true, index: true },
    fyStartYear: { type: Number, required: true, index: true },

    roleKey: { type: String, required: true, index: true }, // any roleKey (salesmanager/salesperson/customer etc)
    entityType: { type: String, required: true, index: true }, // "user" | "customer"
    entityId: { type: String, required: true, index: true },

    monthLabel: { type: String, required: true, index: true }, // "April-2025"

    parentId: { type: String, default: "" }, // for linking / debugging
    totals: {
      amount: { type: Number, default: 0 },
      qty: { type: Number, default: 0 },
    },

    products: { type: [ProductRowSchema], default: [] },

    toggles: {
      inactiveDays: { type: Number, default: 30 },
      redistributeDeadCustomers: { type: Boolean, default: true },
      propagateEditsForward: { type: Boolean, default: true },
    },

    algorithmVersion: { type: String, default: "hwt_v1" },
    computedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

HierarchyTargetAllocationSchema.index(
  {
    database: 1,
    fyStartYear: 1,
    roleKey: 1,
    entityId: 1,
    monthLabel: 1,
  },
  { unique: true, name: "uniq_hwt_alloc" },
);

export const HierarchyTargetAllocation = mongoose.model(
  "HierarchyTargetAllocation",
  HierarchyTargetAllocationSchema,
);
