// File: controller/hrmFace.controller.js
import mongoose from "mongoose";
import { HrmFace } from "../model/hrmFace.model.js";
import HrmEmployeesApp from "../model/hrmEmployeesApp.model.js";
import {
  cleanDatabase,
  fail,
  isValidObjectId,
  parseArrayNumber,
  parseJsonArray,
  success,
  uploadedImageData,
} from "./_hrmCommon.js";

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanPan(value) {
  return cleanText(value).toUpperCase();
}

function cleanDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

function normalizeStatus(value, fallback = "Active") {
  const text = cleanText(value || fallback).toLowerCase();

  if (text === "inactive") return "Inactive";
  if (text === "deleted") return "Deleted";
  return "Active";
}

function objectIdOrNull(value) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

const buildPayload = (body = {}, database) => ({
  database,
  userId: body.userId,
  employeeId: body.employeeId || body.userId || null,
  shiftId: body.shiftId || null,
  panNumber: cleanPan(body.panNumber || body.pan || body.Pan_No),
  aadharNumber: cleanDigits(body.aadharNumber || body.aadhar || body.aadhaar),
  mobileNumber: cleanDigits(body.mobileNumber || body.mobile || body.phone),
  nameSnapshot: cleanText(body.nameSnapshot || body.name || body.employeeName),
  salary: body.salary == null ? "" : String(body.salary),
  imageMimeType: body.imageMimeType || "image/jpeg",
  embedding: parseArrayNumber(body.embedding),
  embeddings: parseJsonArray(body.embeddings, []),
  embeddingModel: body.embeddingModel || "mobile_face_net",
  faceQuality: body.faceQuality || {},
});

function applyFacePayload(row, payload) {
  row.database = payload.database;

  if (payload.userId && isValidObjectId(payload.userId)) {
    row.userId = new mongoose.Types.ObjectId(payload.userId);
  }

  if (payload.employeeId && isValidObjectId(payload.employeeId)) {
    row.employeeId = new mongoose.Types.ObjectId(payload.employeeId);
  } else if (payload.userId && isValidObjectId(payload.userId)) {
    row.employeeId = new mongoose.Types.ObjectId(payload.userId);
  }

  row.shiftId = objectIdOrNull(payload.shiftId);

  row.panNumber = payload.panNumber || "";
  row.aadharNumber = payload.aadharNumber || "";
  row.nameSnapshot = payload.nameSnapshot || "";
  row.salary = payload.salary || "";
  row.imageMimeType = payload.imageMimeType || "image/jpeg";
  row.embedding = payload.embedding || [];
  row.embeddings = payload.embeddings || [];
  row.embeddingModel = payload.embeddingModel || "mobile_face_net";
  row.faceQuality = payload.faceQuality || {};
}

function employeeMatchQueryFromFace(face) {
  const or = [];

  if (face.userId && isValidObjectId(face.userId)) {
    or.push({ _id: face.userId });
  }

  if (face.employeeId && isValidObjectId(face.employeeId)) {
    or.push({ _id: face.employeeId });
  }

  if (face._id) {
    or.push({ faceId: String(face._id) });
  }

  if (cleanPan(face.panNumber)) {
    or.push({ pan: cleanPan(face.panNumber) });
  }

  if (cleanDigits(face.aadharNumber)) {
    or.push({ aadhar: cleanDigits(face.aadharNumber) });
  }

  if (cleanDigits(face.mobileNumber)) {
    or.push({ mobile: cleanDigits(face.mobileNumber) });
  }

  if (!or.length) return null;

  return {
    database: face.database,
    $or: or,
  };
}

async function syncEmployeeFromFace(face) {
  try {
    if (!face || !face.database || !face._id) return;

    const faceStatus = normalizeStatus(face.status, "Active");
    if (!["Active", "Inactive"].includes(faceStatus)) return;

    const query = employeeMatchQueryFromFace(face);
    if (!query) return;

    const update = {
      status: faceStatus,
      faceId: String(face._id),
      faceRegistered: true,
      photoUrl: cleanText(face.photoUrl),
      photoUri: cleanText(face.photoUrl),
    };

    if (cleanText(face.nameSnapshot)) update.name = cleanText(face.nameSnapshot);
    if (cleanText(face.salary)) update.salary = cleanText(face.salary);
    if (cleanPan(face.panNumber)) update.pan = cleanPan(face.panNumber);
    if (cleanDigits(face.aadharNumber)) update.aadhar = cleanDigits(face.aadharNumber);

    await HrmEmployeesApp.findOneAndUpdate(query, update, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    console.log("Face -> employee status sync failed:", error?.message || error);
  }
}

export const createFace = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const payload = buildPayload(req.body, database);

    if (!isValidObjectId(payload.userId)) {
      return fail(res, 400, "Valid userId is required.");
    }

    if (!payload.embedding.length && !payload.embeddings.length) {
      return fail(res, 400, "Face embedding is required.");
    }

    const existing = await HrmFace.findOne({
      database,
      userId: payload.userId,
      status: { $ne: "Deleted" },
    });

    const img = await uploadedImageData(req, existing?.photoUrl || "");

    if (existing) {
      applyFacePayload(existing, payload);

      existing.status = normalizeStatus(req.body.status, "Active");

      if (img.photoUrl) existing.photoUrl = img.photoUrl;
      if (img.photoFileName) existing.photoFileName = img.photoFileName;

      await existing.save();
      await syncEmployeeFromFace(existing);

      return success(res, "Face updated successfully.", existing, {
        updated: true,
      });
    }

    const face = await HrmFace.create({
      ...payload,
      userId: new mongoose.Types.ObjectId(payload.userId),
      employeeId: objectIdOrNull(payload.employeeId || payload.userId),
      shiftId: objectIdOrNull(payload.shiftId),
      photoUrl: img.photoUrl || "",
      photoFileName: img.photoFileName || "",
      status: normalizeStatus(req.body.status, "Active"),
    });

    await syncEmployeeFromFace(face);

    return success(res, "Face saved successfully.", face);
  } catch (e) {
    return fail(res, 500, "Unable to save face.", e);
  }
};

export const listFaces = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const rows = await HrmFace.find({
      database,
      status: { $ne: "Deleted" },
    })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, "Face list fetched successfully.", rows);
  } catch (e) {
    return fail(res, 500, "Unable to fetch face list.", e);
  }
};

export const getFaceById = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid face id is required.");
    }

    const row = await HrmFace.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    }).lean();

    if (!row) return fail(res, 404, "Face not found.");

    return success(res, "Face fetched successfully.", row);
  } catch (e) {
    return fail(res, 500, "Unable to fetch face.", e);
  }
};

export const updateFace = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid face id is required.");
    }

    const row = await HrmFace.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!row) return fail(res, 404, "Face not found.");

    const payload = buildPayload(
      {
        ...row.toObject(),
        ...req.body,
        userId: req.body?.userId ?? row.userId,
        employeeId: req.body?.employeeId ?? row.employeeId,
        shiftId: req.body?.shiftId ?? row.shiftId,
      },
      database,
    );
    const img = await uploadedImageData(req, row.photoUrl || "");

    applyFacePayload(row, payload);

    if (req.body?.status !== undefined) {
      row.status = normalizeStatus(req.body.status, row.status || "Active");
    }

    if (img.photoUrl) row.photoUrl = img.photoUrl;
    if (img.photoFileName) row.photoFileName = img.photoFileName;

    await row.save();
    await syncEmployeeFromFace(row);

    return success(res, "Face updated successfully.", row);
  } catch (e) {
    return fail(res, 500, "Unable to update face.", e);
  }
};

export const updateFaceStatus = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid face id is required.");
    }

    const status = normalizeStatus(req.body?.status, "Active");

    if (!["Active", "Inactive"].includes(status)) {
      return fail(res, 400, "Status must be Active or Inactive.");
    }

    const row = await HrmFace.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!row) return fail(res, 404, "Face not found.");

    row.status = status;
    await row.save();
    await syncEmployeeFromFace(row);

    return success(res, `Face marked ${status}.`, row);
  } catch (e) {
    return fail(res, 500, "Unable to update face status.", e);
  }
};

export const deleteFace = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid face id is required.");
    }

    const row = await HrmFace.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!row) return fail(res, 404, "Face not found.");

    row.status = "Deleted";
    await row.save();

    return success(res, "Face deleted successfully.", row);
  } catch (e) {
    return fail(res, 500, "Unable to delete face.", e);
  }
};
