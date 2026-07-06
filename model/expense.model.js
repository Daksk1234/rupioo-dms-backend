// File: models/expense.model.js

import mongoose from "mongoose";

const CorrectionHistorySchema = new mongoose.Schema(
  {
    correctedAt: { type: Date, default: Date.now },
    correctedBy: { type: String, default: "", trim: true },
    correctedByName: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const ExpensePhotoSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "", trim: true },
    uri: { type: String, default: "", trim: true },
    url: { type: String, default: "" },
    base64: { type: String, default: "" },
    mimeType: { type: String, default: "", trim: true },
    source: { type: String, default: "", trim: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ExpenseSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    employeeId: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    faceId: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    userName: {
      type: String,
      default: "",
      trim: true,
    },

    panNumber: {
      type: String,
      default: "",
      trim: true,
    },

    mobileNumber: {
      type: String,
      default: "",
      trim: true,
    },

    requestedAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    approvedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    natureOfExpense: {
      type: String,
      required: true,
      trim: true,
    },

    categoryOfExpense: {
      type: String,
      required: true,
      trim: true,
    },

    detailsOfExpense: {
      type: String,
      required: true,
      trim: true,
    },

    invoiceNumber: {
      type: String,
      default: "",
      trim: true,
    },

    partyName: {
      type: String,
      default: "",
      trim: true,
    },

    partyContact: {
      type: String,
      default: "",
      trim: true,
    },

    expenseDate: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    durationFrom: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    durationTo: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    totalDays: {
      type: Number,
      default: 1,
    },

    expensePhotos: {
      type: [ExpensePhotoSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["Requested", "Approved", "Rejected", "Deleted"],
      default: "Requested",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Paid"],
      default: "Unpaid",
      index: true,
    },

    paymentRemark: {
      type: String,
      default: "",
      trim: true,
    },

    paidBy: {
      type: String,
      default: "",
      trim: true,
    },

    paidByName: {
      type: String,
      default: "",
      trim: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    paidOn: {
      type: String,
      default: "",
      trim: true,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    superAdminRemark: {
      type: String,
      default: "",
      trim: true,
    },

    approvedBy: {
      type: String,
      default: "",
      trim: true,
    },

    approvedByName: {
      type: String,
      default: "",
      trim: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: String,
      default: "",
      trim: true,
    },

    rejectedByName: {
      type: String,
      default: "",
      trim: true,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    createdByName: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
      trim: true,
    },

    correctedCount: {
      type: Number,
      default: 0,
    },

    correctionHistory: {
      type: [CorrectionHistorySchema],
      default: [],
    },

    ledgerTransferStatus: {
      type: String,
      enum: ["Not Ready", "Ready", "Transferred", "Failed"],
      default: "Not Ready",
      index: true,
    },

    ledgerTransferMessage: {
      type: String,
      default: "",
      trim: true,
    },

    ledgerPayload: {
      type: Object,
      default: null,
    },
  },
  { timestamps: true },
);

ExpenseSchema.index({
  database: 1,
  status: 1,
  createdAt: -1,
});

ExpenseSchema.index({
  database: 1,
  userId: 1,
  status: 1,
});

ExpenseSchema.index({
  database: 1,
  status: 1,
  paymentStatus: 1,
});

export default mongoose.model("Expense", ExpenseSchema);
