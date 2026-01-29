import mongoose from "mongoose";
const { Schema } = mongoose;

const SalesPersonTargetProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qtyAssign: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    assignPercentage: { type: [Number], default: [] }, // keep for future use
  },
  { _id: false }
);

const SalesPersonTargetSchema = new Schema(
  {
    database: { type: String }, // multi-tenant key

    salesPersonId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salesPersonName: { type: String },

    monthName: { type: String, required: true }, // e.g. "April"
    financialYear: { type: String, required: true }, // e.g. "2025-26"
    date: { type: String }, // e.g. "April-2026" (FY-aware month-year label)

    incrementPercent: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    products: {
      type: [SalesPersonTargetProductSchema],
      default: [],
    },

    created_by: { type: Schema.Types.ObjectId, ref: "User" },

    status: {
      type: String,
      enum: ["Active", "Deactive"],
      default: "Active",
    },
  },
  { timestamps: true }
);

export const SalesPersonTarget = mongoose.model(
  "SalesPersonTarget",
  SalesPersonTargetSchema
);
