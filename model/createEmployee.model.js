// File: model/createEmployee.model.js

import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    created_by: {
      type: String,
    },

    database: {
      type: String,
      index: true,
    },

    Image: {
      type: String,
    },

    Name: {
      type: String,
    },

    DOB: {
      type: String,
    },

    Address: {
      type: String,
    },

    Email: {
      type: String,
    },

    Password: {
      type: String,
    },

    Contact: {
      type: String,
      index: true,
    },

    Designation: {
      type: String,
    },

    AadharNo: {
      type: String,
      index: true,
    },

    PanNo: {
      type: String,
      uppercase: true,
      index: true,
    },

    Salary: {
      type: String,
      default: "",
    },

    salaryType: {
      type: String,
      enum: ["Monthly", "Daily", "Hourly"],
      default: "Monthly",
      index: true,
    },

    ReferalName: {
      type: String,
    },

    ReferalContactNo: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

export const Employee =
  mongoose.models.employee || mongoose.model("employee", employeeSchema);
