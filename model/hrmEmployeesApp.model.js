import mongoose from "mongoose";

const HrmEmployeesAppSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    created_by: {
      type: String,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    dob: {
      type: String,
      default: "",
      trim: true,
    },
    mobile: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    pan: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
      index: true,
    },
    aadhar: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    pincode: {
      type: String,
      default: "",
      trim: true,
    },
    designation: {
      type: String,
      default: "",
      trim: true,
    },
    salary: {
      type: String,
      default: "",
      trim: true,
    },
    shiftId: {
      type: String,
      default: "",
      trim: true,
    },
    photoUri: {
      type: String,
      default: "",
      trim: true,
    },
    photoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    faceId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    faceRegistered: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

HrmEmployeesAppSchema.index(
  { database: 1, pan: 1 },
  {
    unique: true,
    partialFilterExpression: { pan: { $type: "string", $gt: "" } },
  },
);

HrmEmployeesAppSchema.index(
  { database: 1, aadhar: 1 },
  {
    unique: true,
    partialFilterExpression: { aadhar: { $type: "string", $gt: "" } },
  },
);

const HrmEmployeesApp =
  mongoose.models.HrmEmployeesApp ||
  mongoose.model("HrmEmployeesApp", HrmEmployeesAppSchema);

export default HrmEmployeesApp;
