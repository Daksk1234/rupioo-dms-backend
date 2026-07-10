// File: controller/createEmployee.controller.js

import mongoose from "mongoose";
import { Employee } from "../model/createEmployee.model.js";
import { HrmFace } from "../model/hrmFace.model.js";

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

function cleanPan(value) {
  return cleanText(value).toUpperCase();
}

function normalizeSalaryType(value, fallback = "Monthly") {
  const text = cleanText(value || fallback).toLowerCase();

  if (text === "daily" || text === "day") return "Daily";
  if (text === "hourly" || text === "hour") return "Hourly";
  return "Monthly";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function employeePayload(body = {}) {
  return {
    ...body,
    Contact: cleanDigits(body.Contact || body.mobile || body.mobileNumber),
    PanNo: cleanPan(body.PanNo || body.pan || body.panNumber),
    AadharNo: cleanDigits(body.AadharNo || body.aadhar || body.aadharNumber),
    Salary: cleanText(body.Salary || body.salary),
    salaryType: normalizeSalaryType(
      body.salaryType || body.payType || body.paymentType,
    ),
  };
}

async function syncFaceFromLegacyEmployee(employee) {
  try {
    if (!employee || !employee.database || !employee._id) return;

    const or = [{ userId: employee._id }, { employeeId: employee._id }];

    if (cleanPan(employee.PanNo)) {
      or.push({ panNumber: cleanPan(employee.PanNo) });
    }

    if (cleanDigits(employee.AadharNo)) {
      or.push({ aadharNumber: cleanDigits(employee.AadharNo) });
    }

    if (cleanDigits(employee.Contact)) {
      or.push({ mobileNumber: cleanDigits(employee.Contact) });
    }

    const update = {
      userId: employee._id,
      employeeId: employee._id,
      nameSnapshot: cleanText(employee.Name),
      panNumber: cleanPan(employee.PanNo),
      aadharNumber: cleanDigits(employee.AadharNo),
      mobileNumber: cleanDigits(employee.Contact),
      salary: cleanText(employee.Salary),
      salaryType: normalizeSalaryType(employee.salaryType),
    };

    await HrmFace.findOneAndUpdate(
      {
        database: employee.database,
        status: { $ne: "Deleted" },
        $or: or,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    );
  } catch (error) {
    console.log(
      "Legacy employee -> face sync failed:",
      error?.message || error,
    );
  }
}

export const saveEmployeeDetails = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.Image = req.file.filename;
    }

    const payload = employeePayload(req.body);
    const employee = await Employee.create(payload);

    await syncFaceFromLegacyEmployee(employee);

    return employee
      ? res.status(200).json({
          message: "employee details saved successfull",
          status: true,
          employee,
        })
      : res.status(400).json({
          message: "something went wrong",
          status: false,
        });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || "Unable to save employee.",
      status: false,
    });
  }
};

export const viewEmployeeDetail = async (req, res, next) => {
  try {
    const query = req.params?.database
      ? { database: cleanText(req.params.database) }
      : {};

    const employee = await Employee.find(query).sort({ sortorder: -1 });

    return employee.length > 0
      ? res.status(200).json({
          EmployeeDetail: employee,
          status: true,
        })
      : res.status(404).json({
          message: "User Not Found",
          status: false,
        });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || "Unable to fetch employees.",
      status: false,
    });
  }
};

export const updateEmployeeDetails = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Valid employee id is required.",
        status: false,
      });
    }

    if (req.file) {
      req.body.Image = req.file.filename;
    }

    const payload = employeePayload(req.body);

    const employee = await Employee.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found.",
        status: false,
      });
    }

    await syncFaceFromLegacyEmployee(employee);

    return res.status(200).json({
      message: "employee details updated successfully",
      status: true,
      employee,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || "Unable to update employee.",
      status: false,
    });
  }
};
