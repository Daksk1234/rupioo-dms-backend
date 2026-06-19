import mongoose from "mongoose";

const ApprovalChainSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      default: 1,
    },

    approverId: {
      type: String,
      default: "",
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

const LeaveSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    leaveRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveRequest",
      default: null,
      index: true,
    },

    source: {
      type: String,
      enum: ["Request", "Admin", "Attendance"],
      default: "Request",
      index: true,
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
      enum: ["Accepted", "Rejected", "Cancelled", "Deleted"],
      default: "Accepted",
      index: true,
    },

    approvalChain: {
      type: [ApprovalChainSchema],
      default: [],
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

    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
      trim: true,
    },

    deletedBy: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledByAttendance: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

LeaveSchema.index({
  database: 1,
  userId: 1,
  status: 1,
  fromDate: 1,
  toDate: 1,
});

LeaveSchema.index({
  database: 1,
  employeeId: 1,
  status: 1,
  fromDate: 1,
  toDate: 1,
});

export default mongoose.model("Leave", LeaveSchema);
