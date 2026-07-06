// File: controllers/hrmEmployeesApp.controller.js
import mongoose from "mongoose";
import HrmEmployeesApp from "../model/hrmEmployeesApp.model.js";
import { HrmFace } from "../model/hrmFace.model.js";

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function onlyDigits(value) {
  return safeText(value).replace(/\D/g, "");
}

function cleanPan(value) {
  return safeText(value).toUpperCase();
}

function normalizeStatus(value, fallback = "Active") {
  const text = safeText(value || fallback).toLowerCase();

  if (text === "inactive") return "Inactive";
  return "Active";
}

function hasBodyKey(body = {}, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function employeePayload(body = {}) {
  return {
    database: safeText(body.database),
    created_by: safeText(body.created_by || body.createdBy),
    name: safeText(body.name),
    address: safeText(body.address),
    dob: safeText(body.dob),
    mobile: onlyDigits(body.mobile || body.mobileNumber),
    pan: cleanPan(body.pan || body.panNumber),
    aadhar: onlyDigits(body.aadhar || body.aadharNumber),
    pincode: onlyDigits(body.pincode),
    designation: safeText(body.designation),
    salary: safeText(body.salary),
    shiftId: safeText(body.shiftId),
    photoUri: safeText(body.photoUri),
    photoUrl: safeText(body.photoUrl),
    faceId: safeText(body.faceId),
    faceRegistered:
      body.faceRegistered === true ||
      body.faceRegistered === "true" ||
      !!safeText(body.faceId),
    status: normalizeStatus(body.status, "Active"),
    raw: body.raw || {},
  };
}

function employeeUpdatePayload(body = {}) {
  const update = {};

  if (hasBodyKey(body, "created_by") || hasBodyKey(body, "createdBy")) {
    update.created_by = safeText(body.created_by || body.createdBy);
  }

  if (hasBodyKey(body, "name")) update.name = safeText(body.name);
  if (hasBodyKey(body, "address")) update.address = safeText(body.address);
  if (hasBodyKey(body, "dob")) update.dob = safeText(body.dob);
  if (hasBodyKey(body, "mobile") || hasBodyKey(body, "mobileNumber")) {
    update.mobile = onlyDigits(body.mobile || body.mobileNumber);
  }
  if (hasBodyKey(body, "pan") || hasBodyKey(body, "panNumber")) {
    update.pan = cleanPan(body.pan || body.panNumber);
  }
  if (hasBodyKey(body, "aadhar") || hasBodyKey(body, "aadharNumber")) {
    update.aadhar = onlyDigits(body.aadhar || body.aadharNumber);
  }
  if (hasBodyKey(body, "pincode")) update.pincode = onlyDigits(body.pincode);
  if (hasBodyKey(body, "designation")) {
    update.designation = safeText(body.designation);
  }
  if (hasBodyKey(body, "salary")) update.salary = safeText(body.salary);
  if (hasBodyKey(body, "shiftId")) update.shiftId = safeText(body.shiftId);
  if (hasBodyKey(body, "photoUri")) update.photoUri = safeText(body.photoUri);
  if (hasBodyKey(body, "photoUrl")) update.photoUrl = safeText(body.photoUrl);
  if (hasBodyKey(body, "faceId")) update.faceId = safeText(body.faceId);
  if (hasBodyKey(body, "faceRegistered")) {
    update.faceRegistered =
      body.faceRegistered === true || body.faceRegistered === "true";
  }
  if (hasBodyKey(body, "status")) {
    update.status = normalizeStatus(body.status, "Active");
  }
  if (hasBodyKey(body, "raw")) update.raw = body.raw || {};

  if (update.faceId) update.faceRegistered = true;

  return update;
}

function sendError(res, error, fallback = "Something went wrong") {
  const code = error?.code === 11000 ? 409 : 500;

  return res.status(code).json({
    status: false,
    message:
      error?.code === 11000
        ? "Employee with same PAN or Aadhaar already exists."
        : error?.message || fallback,
  });
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function faceMatchQueryFromEmployee(employee) {
  const or = [];

  if (employee._id && isValidObjectId(employee._id)) {
    or.push({ userId: employee._id });
    or.push({ employeeId: employee._id });
  }

  if (safeText(employee.faceId) && isValidObjectId(employee.faceId)) {
    or.push({ _id: employee.faceId });
  }

  if (cleanPan(employee.pan)) {
    or.push({ panNumber: cleanPan(employee.pan) });
  }

  if (onlyDigits(employee.aadhar)) {
    or.push({ aadharNumber: onlyDigits(employee.aadhar) });
  }

  if (!or.length) return null;

  return {
    database: employee.database,
    status: { $ne: "Deleted" },
    $or: or,
  };
}

async function syncFaceFromEmployee(employee) {
  try {
    if (!employee || !employee.database || !employee._id) return;

    const status = normalizeStatus(employee.status, "Active");
    const query = faceMatchQueryFromEmployee(employee);

    if (!query) return;

    const update = {
      status,
      employeeId: employee._id,
      userId: employee._id,
      nameSnapshot: safeText(employee.name),
      salary: safeText(employee.salary),
      panNumber: cleanPan(employee.pan),
      aadharNumber: onlyDigits(employee.aadhar),
    };

    if (safeText(employee.shiftId) && isValidObjectId(employee.shiftId)) {
      update.shiftId = new mongoose.Types.ObjectId(employee.shiftId);
    }

    const face = await HrmFace.findOneAndUpdate(query, update, {
      new: true,
      runValidators: true,
    });

    if (face && String(employee.faceId || "") !== String(face._id || "")) {
      await HrmEmployeesApp.findByIdAndUpdate(employee._id, {
        faceId: String(face._id),
        faceRegistered: true,
      });
    }
  } catch (error) {
    console.log("Employee -> face status sync failed:", error?.message || error);
  }
}

export const createHrmEmployeeApp = async (req, res) => {
  try {
    const payload = employeePayload(req.body);

    if (!payload.database) {
      return res.status(400).json({
        status: false,
        message: "database is required.",
      });
    }

    if (!payload.name) {
      return res.status(400).json({
        status: false,
        message: "Employee name is required.",
      });
    }

    const employee = await HrmEmployeesApp.create(payload);
    await syncFaceFromEmployee(employee);

    return res.status(201).json({
      status: true,
      message: "Employee created successfully.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to create employee.");
  }
};

export const viewHrmEmployeesApp = async (req, res) => {
  try {
    const database = safeText(req.params.database || req.query.database);

    if (!database) {
      return res.status(400).json({
        status: false,
        message: "database is required.",
      });
    }

    const employees = await HrmEmployeesApp.find({ database })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      data: employees,
      employees,
      total: employees.length,
    });
  } catch (error) {
    return sendError(res, error, "Unable to fetch employees.");
  }
};

export const viewHrmEmployeeAppById = async (req, res) => {
  try {
    const employee = await HrmEmployeesApp.findById(req.params.id).lean();

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to fetch employee.");
  }
};

export const updateHrmEmployeeApp = async (req, res) => {
  try {
    const payload = employeeUpdatePayload(req.body);

    const employee = await HrmEmployeesApp.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true },
    );

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    await syncFaceFromEmployee(employee);

    return res.status(200).json({
      status: true,
      message: "Employee updated successfully.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to update employee.");
  }
};

export const setHrmEmployeeStatusApp = async (req, res) => {
  try {
    const status = normalizeStatus(req.body?.status, "Active");

    const employee = await HrmEmployeesApp.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    );

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    await syncFaceFromEmployee(employee);

    return res.status(200).json({
      status: true,
      message: `Employee marked ${status}.`,
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to update employee status.");
  }
};

export const markHrmEmployeeFaceRegistered = async (req, res) => {
  try {
    const update = {
      faceId: safeText(req.body.faceId),
      faceRegistered: true,
      photoUri: safeText(req.body.photoUri),
      photoUrl: safeText(req.body.photoUrl),
    };

    if (req.body?.status !== undefined) {
      update.status = normalizeStatus(req.body.status, "Active");
    }

    const employee = await HrmEmployeesApp.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    );

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    await syncFaceFromEmployee(employee);

    return res.status(200).json({
      status: true,
      message: "Employee face registration updated.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to update face registration.");
  }
};

export const deleteHrmEmployeeApp = async (req, res) => {
  try {
    const employee = await HrmEmployeesApp.findByIdAndDelete(req.params.id);

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Employee deleted successfully.",
    });
  } catch (error) {
    return sendError(res, error, "Unable to delete employee.");
  }
};
