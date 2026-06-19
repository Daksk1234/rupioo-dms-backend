// File: model/hrmEmployeeLedger.model.js

import mongoose from "mongoose";

const hrmEmployeeLedgerSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    employeeIdText: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    employeeName: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hrmLoanAdvance",
      default: null,
      index: true,
    },

    date: {
      type: String,
      default: "",
      index: true,
    },

    month: {
      type: String,
      default: "",
      index: true,
    },

    type: {
      type: String,
      enum: [
        "Loan",
        "Advance",
        "Loan EMI Deduction",
        "Advance Deduction",
        "Manual Adjustment",
        "Opening",
      ],
      default: "Manual Adjustment",
      index: true,
    },

    particulars: {
      type: String,
      default: "",
      trim: true,
    },

    debit: {
      type: Number,
      default: 0,
    },

    credit: {
      type: Number,
      default: 0,
    },

    balance: {
      type: Number,
      default: 0,
    },

    deductionMode: {
      type: String,
      default: "",
    },

    deductionAmount: {
      type: Number,
      default: 0,
    },

    deductionMonth: {
      type: String,
      default: "",
      index: true,
    },

    deductionStartMonth: {
      type: String,
      default: "",
    },

    source: {
      type: String,
      default: "LoansAdvancesScreen",
    },

    referenceNo: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Deleted"],
      default: "Active",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

hrmEmployeeLedgerSchema.index(
  { database: 1, employeeId: 1, month: 1, status: 1 },
  { name: "hrm_employee_ledger_employee_month_idx" },
);

hrmEmployeeLedgerSchema.index(
  { database: 1, requestId: 1, status: 1 },
  { name: "hrm_employee_ledger_request_idx" },
);

export const HrmEmployeeLedger =
  mongoose.models.hrmEmployeeLedger ||
  mongoose.model("hrmEmployeeLedger", hrmEmployeeLedgerSchema);
