import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productId: String,
    category: String,
    subCategory: String,
    productName: String,
    pQty: Number,
    sQty: Number,
    price: Number,
    total: Number,
    secondarySize: Number,
  },
  { _id: false },
);

const roleTargetSchema = new mongoose.Schema(
  {
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "role",
    },
    rolePosition: Number,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    firstName: String,
    total: Number,
    products: [productSchema],
  },
  { _id: false },
);

const companyTargetSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
    },
    fyear: {
      type: String,
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    managerName: String,
    managerTotal: Number,
    incrementper: String,
    companyTotal: Number,
    productItem: [productSchema],
    hierarchyTargets: [roleTargetSchema],
    created_by: {
      type: String,
    },
  },
  { timestamps: true },
);

companyTargetSchema.index(
  { database: 1, fyear: 1, month: 1, managerId: 1 },
  { unique: true },
);

export const CompanyTarget = mongoose.model(
  "companytarget",
  companyTargetSchema,
);
