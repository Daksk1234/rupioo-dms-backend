import mongoose from "mongoose";

const ApprovalChainSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      default: 1,
    },

    approverId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    approverName: {
      type: String,
      default: "",
      trim: true,
    },

    roleName: {
      type: String,
      default: "",
      trim: true,
    },

    isSuperAdmin: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Skipped"],
      default: "Pending",
      index: true,
    },

    remark: {
      type: String,
      default: "",
      trim: true,
    },

    actionAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const LeaveRequestSchema = new mongoose.Schema(
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

    fromDate: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    toDate: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    totalDays: {
      type: Number,
      default: 1,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Cancelled", "Deleted"],
      default: "Pending",
      index: true,
    },

    approvalChain: {
      type: [ApprovalChainSchema],
      default: [],
    },

    currentApproverId: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    currentApproverName: {
      type: String,
      default: "",
      trim: true,
    },

    currentLevel: {
      type: Number,
      default: 1,
    },

    requestedBy: {
      type: String,
      default: "",
      trim: true,
    },

    requestedByName: {
      type: String,
      default: "",
      trim: true,
    },

    finalActionBy: {
      type: String,
      default: "",
      trim: true,
    },

    finalActionByName: {
      type: String,
      default: "",
      trim: true,
    },

    finalActionAt: {
      type: Date,
      default: null,
    },

    finalRemark: {
      type: String,
      default: "",
      trim: true,
    },

    leavePayType: {
      type: String,
      enum: ["", "Paid", "Free"],
      default: "",
    },

    salaryDeductible: {
      type: Boolean,
      default: false,
    },

    linkedLeaveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Leave",
      default: null,
    },
  },
  { timestamps: true },
);

LeaveRequestSchema.index({
  database: 1,
  status: 1,
  fromDate: 1,
  toDate: 1,
});

LeaveRequestSchema.index({
  database: 1,
  currentApproverId: 1,
  status: 1,
});

export default mongoose.model("LeaveRequest", LeaveRequestSchema);
