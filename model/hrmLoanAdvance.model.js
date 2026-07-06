// File: model/hrmLoanAdvance.model.js

import mongoose from "mongoose";

const emiScheduleSchema = new mongoose.Schema(
  {
    emiNo: {
      type: Number,
      default: 0,
    },

    dueMonth: {
      type: String,
      default: "",
      index: true,
    },

    dueDate: {
      type: String,
      default: "",
    },

    amount: {
      type: Number,
      default: 0,
    },

    principalPart: {
      type: Number,
      default: 0,
    },

    interestPart: {
      type: Number,
      default: 0,
    },

    remainingBalance: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Pending", "Deducted", "Skipped", "Waived"],
      default: "Pending",
      index: true,
    },

    deductedFromSalary: {
      type: Boolean,
      default: false,
    },

    deductedAt: {
      type: String,
      default: "",
    },

    salaryMonth: {
      type: String,
      default: "",
    },

    ledgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hrmEmployeeLedger",
      default: null,
    },
  },
  { _id: true },
);

const customerOutstandingSnapshotSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      default: "",
    },

    customerName: {
      type: String,
      default: "",
    },

    date: {
      type: String,
      default: "",
    },

    invoiceNo: {
      type: String,
      default: "",
    },

    amount: {
      type: Number,
      default: 0,
    },

    remarks: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      default: "",
    },

    url: {
      type: String,
      default: "",
    },

    mimeType: {
      type: String,
      default: "",
    },

    size: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const hrmLoanAdvanceSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    requestNo: {
      type: String,
      default: "",
      index: true,
    },

    requestDate: {
      type: String,
      default: "",
      index: true,
    },

    requestType: {
      type: String,
      enum: ["Loan", "Advance"],
      required: true,
      index: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    employeeIdText: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    employeeName: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    salary: {
      type: Number,
      default: 0,
    },

    amount: {
      type: Number,
      default: 0,
    },

    interestRate: {
      type: Number,
      default: 0,
    },

    tenureMonths: {
      type: Number,
      default: 0,
    },

    monthlyEmi: {
      type: Number,
      default: 0,
    },

    totalPayable: {
      type: Number,
      default: 0,
    },

    totalInterest: {
      type: Number,
      default: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    outstandingAmount: {
      type: Number,
      default: 0,
    },

    limitPercent: {
      type: Number,
      default: 30,
    },

    allowedLimitAmount: {
      type: Number,
      default: 0,
    },

    isWithinLimit: {
      type: Boolean,
      default: true,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    guardianApprovalAttachment: {
      type: String,
      default: "",
    },

    guardianApprovalAttachments: {
      type: [attachmentSchema],
      default: [],
    },

    customerOutstandingSnapshot: {
      type: [customerOutstandingSnapshotSchema],
      default: [],
    },

    customerOutstandingTotal: {
      type: Number,
      default: 0,
    },

    customerOutstandingCount: {
      type: Number,
      default: 0,
    },

    riskRemark: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Hold",
        "Paid",
        "Closed",
        "Deleted",
      ],
      default: "Pending",
      index: true,
    },

    approvalRemark: {
      type: String,
      default: "",
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
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    paidByName: {
      type: String,
      default: "",
      trim: true,
    },

    paidAt: {
      type: String,
      default: "",
    },

    paidOn: {
      type: String,
      default: "",
      index: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    approvedAt: {
      type: String,
      default: "",
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    rejectedAt: {
      type: String,
      default: "",
    },

    holdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    holdAt: {
      type: String,
      default: "",
    },

    holdReason: {
      type: String,
      default: "",
    },

    salaryDeductionAmount: {
      type: Number,
      default: 0,
    },

    salaryDeductionMonth: {
      type: String,
      default: "",
      index: true,
    },

    deductionStartMonth: {
      type: String,
      default: "",
      index: true,
    },

    deductionMode: {
      type: String,
      enum: ["", "Monthly EMI", "Same Month Salary"],
      default: "",
    },

    emiSchedule: {
      type: [emiScheduleSchema],
      default: [],
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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

hrmLoanAdvanceSchema.index(
  { database: 1, employeeId: 1, requestType: 1, status: 1 },
  { name: "hrm_loan_advance_employee_status_idx" },
);

hrmLoanAdvanceSchema.index(
  { database: 1, requestDate: 1, status: 1 },
  { name: "hrm_loan_advance_date_status_idx" },
);

hrmLoanAdvanceSchema.index(
  { database: 1, deductionStartMonth: 1, status: 1 },
  { name: "hrm_loan_advance_deduction_month_idx" },
);

hrmLoanAdvanceSchema.index(
  { database: 1, status: 1, paymentStatus: 1, requestDate: -1 },
  { name: "hrm_loan_advance_payment_status_idx" },
);

export const HrmLoanAdvance =
  mongoose.models.hrmLoanAdvance ||
  mongoose.model("hrmLoanAdvance", hrmLoanAdvanceSchema);
