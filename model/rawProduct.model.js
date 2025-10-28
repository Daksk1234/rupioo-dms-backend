import mongoose from "mongoose";
const rawProductSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    created_by: {
      type: String,
    },
    database: {
      type: String,
    },
    qty: {
      type: Number,
      default: 0,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "warehouse",
    },
    warehouseName: {
      type: String,
    },
    SubStep: {
      type: String,
    },
    NextSubStep: {
      type: String,
    },
    stockUnit: {
      type: String,
    },
    secondaryUnit: {
      type: String,
    },
    category: {
      type: String,
    },
    SubCategory: {
      type: String,
    },
    productSection: {
      type: String,
    },
    Product_Title: {
      type: String,
    },
    Opening_Stock: {
      type: Number,
    },
    MIN_stockalert: {
      type: Number,
    },
    Units: [],
    rawValues: [],
    grossTotal: {
      type: Number,
    },
    expensePercentage: {
      type: Number,
    },
    netAmount: {
      type: Number,
    },
    targetValues: [],
    status: {
      type: String,
      default: "Active",
    },
  },
  { timestamps: true }
);
export const RawProduct = mongoose.model("rawProduct", rawProductSchema);
