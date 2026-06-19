// File: model/yearlyTarget.model.js
import mongoose from "mongoose";

const YearlyProductTargetSchema = new mongoose.Schema(
  {
    productId: { type: String, default: "", index: true },
    productName: { type: String, default: "", trim: true },

    category: { type: String, default: "", trim: true },
    catageory: { type: String, default: "", trim: true },
    subCategory: { type: String, default: "", trim: true },
    color: { type: String, default: "", trim: true },

    basicPrice: { type: Number, default: 0 },
    saleRate: { type: Number, default: 0 },
    price: { type: Number, default: 0 },

    secondaryUnitName: { type: String, default: "", trim: true },
    primaryUnitName: { type: String, default: "", trim: true },
    secondarySize: { type: Number, default: 1 },

    secondaryQty: { type: Number, default: 0 },
    sQty: { type: Number, default: 0 },

    primaryQty: { type: Number, default: 0 },
    pQty: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
    qtyAssign: { type: Number, default: 0 },

    total: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    targetAmount: { type: Number, default: 0 },
  },
  { _id: false },
);

const MonthlyTargetSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, trim: true, index: true },
    monthIndex: { type: Number, default: 0 },

    targetTotal: { type: Number, default: 0 },
    totalSecondaryQty: { type: Number, default: 0 },
    totalPrimaryQty: { type: Number, default: 0 },

    productTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    products: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    isEdited: { type: Boolean, default: false },
    isCustomerEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    edited_by: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const AssignedCustomerSchema = new mongoose.Schema(
  {
    customerId: { type: String, default: "", trim: true },
    customerIds: { type: [String], default: [] },
    customerName: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const AssignedSalesPersonSchema = new mongoose.Schema(
  {
    salesPersonId: { type: String, default: "", trim: true },
    salesPersonIds: { type: [String], default: [] },
    salesPersonName: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const CustomerTargetSchema = new mongoose.Schema(
  {
    customerId: { type: String, default: "", trim: true, index: true },
    customerIds: { type: [String], default: [] },

    customerName: { type: String, default: "", trim: true },
    salesPersonName: { type: String, default: "", trim: true },

    yearlyTotal: { type: Number, default: 0 },
    targetTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    productTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    products: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    monthlyTargets: {
      type: [MonthlyTargetSchema],
      default: [],
    },

    generated: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },

    updatedAt: { type: Date, default: null },
    updated_by: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const SalesPersonTargetSchema = new mongoose.Schema(
  {
    salesPersonId: { type: String, default: "", trim: true, index: true },
    salesPersonIds: { type: [String], default: [] },
    salesPersonName: { type: String, default: "", trim: true },

    customerCount: { type: Number, default: 0 },

    assignedCustomers: {
      type: [AssignedCustomerSchema],
      default: [],
    },

    assignedCustomerTargetIds: {
      type: [String],
      default: [],
    },

    yearlyTotal: { type: Number, default: 0 },
    targetTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    productTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    products: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    monthlyTargets: {
      type: [MonthlyTargetSchema],
      default: [],
    },

    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const SalesManagerTargetSchema = new mongoose.Schema(
  {
    salesManagerId: { type: String, default: "", trim: true, index: true },
    salesManagerIds: { type: [String], default: [] },
    salesManagerName: { type: String, default: "", trim: true },

    salesPersonCount: { type: Number, default: 0 },

    assignedSalesPersons: {
      type: [AssignedSalesPersonSchema],
      default: [],
    },

    assignedSalesPersonTargetIds: {
      type: [String],
      default: [],
    },

    yearlyTotal: { type: Number, default: 0 },
    targetTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    productTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    products: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    monthlyTargets: {
      type: [MonthlyTargetSchema],
      default: [],
    },

    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const YearlyTargetSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    fyear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    targetName: {
      type: String,
      default: "",
      trim: true,
    },

    filters: {
      category: { type: String, default: "", trim: true },
      subCategory: { type: String, default: "", trim: true },
      color: { type: String, default: "", trim: true },
      search: { type: String, default: "", trim: true },
    },

    grandTotal: { type: Number, default: 0 },
    targetTotal: { type: Number, default: 0 },
    totalSecondaryQty: { type: Number, default: 0 },
    totalPrimaryQty: { type: Number, default: 0 },

    productTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    products: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    monthlyTargets: {
      type: [MonthlyTargetSchema],
      default: [],
    },

    // Once this becomes true, customer targets must not be re-divided
    // from the changed company yearly target.
    customerSplitLocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Original company target snapshot when equal split was first saved.
    splitBaseGrandTotal: {
      type: Number,
      default: 0,
    },

    splitBaseMonthlyTargets: {
      type: [MonthlyTargetSchema],
      default: [],
    },

    splitBaseProductTargets: {
      type: [YearlyProductTargetSchema],
      default: [],
    },

    // Independent customer-wise targets.
    customerTargets: {
      type: [CustomerTargetSchema],
      default: [],
    },

    // Roll-up from assigned customers.
    salesPersonTargets: {
      type: [SalesPersonTargetSchema],
      default: [],
    },

    // Roll-up from assigned sales persons.
    salesManagerTargets: {
      type: [SalesManagerTargetSchema],
      default: [],
    },

    created_by: { type: String, default: "", trim: true },
    updated_by: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["Active", "Deactive", "Deleted"],
      default: "Active",
      index: true,
    },
  },
  { timestamps: true },
);

YearlyTargetSchema.index({ database: 1, fyear: 1, status: 1 });
YearlyTargetSchema.index({ database: 1, createdAt: -1 });
YearlyTargetSchema.index({ database: 1, fyear: 1, customerSplitLocked: 1 });

export default mongoose.model("YearlyTarget", YearlyTargetSchema);
