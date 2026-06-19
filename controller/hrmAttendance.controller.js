// File: controller/hrmAttendance.controller.js

import mongoose from "mongoose";
import { HrmAttendance } from "../model/hrmAttendance.model.js";
import { HrmFace } from "../model/hrmFace.model.js";

const success = (res, message, data = null, extra = {}) => {
  return res.status(200).json({
    status: true,
    message,
    data,
    ...extra,
  });
};

const fail = (res, code, message, error = null) => {
  return res.status(code).json({
    status: false,
    message,
    error: error ? String(error?.message || error) : undefined,
  });
};

const cleanDatabase = (value) => {
  const db = String(value || "").trim();

  if (!db) throw new Error("Database is required.");

  if (!/^[a-zA-Z0-9_-]+$/.test(db)) {
    throw new Error("Invalid database name.");
  }

  return db;
};

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));

const toObjectId = (value) => {
  if (!isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const str = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const bool = (value) => {
  return value === true || value === "true" || value === 1 || value === "1";
};

const todayDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
};

const normalizeTime = (value) => {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{1,2}\.\d{1,2}$/.test(raw)) {
    const [h, m] = raw.split(".");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  if (/^\d{1,2}:\d{1,2}$/.test(raw)) {
    const [h, m] = raw.split(":");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return raw;
};

const minutesFromTime = (value) => {
  if (!value) return null;

  const time = normalizeTime(value);

  const ampm = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);

  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const p = ampm[3].toUpperCase();

    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;

    return h * 60 + m;
  }

  const normal = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);

  if (normal) {
    return Number(normal[1]) * 60 + Number(normal[2]);
  }

  return null;
};

const minutesToHoursText = (minutes) => {
  const m = Math.max(num(minutes), 0);
  const h = Math.floor(m / 60);
  const min = m % 60;

  if (h && min) return `${h} hr ${min} min`;
  if (h) return `${h} hr`;
  if (min) return `${min} min`;

  return "0 min";
};

const calculateLate = (inTime, expectedInTime) => {
  const actual = minutesFromTime(inTime);
  const expected = minutesFromTime(expectedInTime);

  if (actual === null || expected === null) return 0;

  return Math.max(actual - expected, 0);
};

const calculateEarlyOut = (outTime, expectedOutTime) => {
  const actual = minutesFromTime(outTime);
  const expected = minutesFromTime(expectedOutTime);

  if (actual === null || expected === null) return 0;

  return Math.max(expected - actual, 0);
};

const calculateWorkingMinutes = ({
  inTime,
  outTime,
  expectedInTime,
  expectedOutTime,
}) => {
  const actualIn = minutesFromTime(inTime);
  const actualOut = minutesFromTime(outTime);

  if (actualIn === null || actualOut === null) return 0;

  let finalIn = actualIn;
  let finalOut = actualOut;

  const expectedIn = minutesFromTime(expectedInTime);
  const expectedOut = minutesFromTime(expectedOutTime);

  if (expectedIn !== null && expectedOut !== null) {
    finalIn = Math.max(actualIn, expectedIn);
    finalOut = Math.min(actualOut, expectedOut);
  }

  let diff = finalOut - finalIn;

  if (diff < 0) diff += 24 * 60;

  return Math.max(diff, 0);
};

const populateAttendanceQuery = (query) => {
  return query
    .populate({
      path: "faceId",
      select:
        "database userId employeeId shiftId panNumber aadharNumber nameSnapshot salary photoUrl status",
    })
    .populate({
      path: "shiftId",
      select:
        "database shiftName shiftCode lastMinuteAttendance graceInMinutes graceOutMinutes days status",
    });
};

const normalizePopulatedAttendance = (row) => {
  if (!row) return row;

  const face = row.faceId && typeof row.faceId === "object" ? row.faceId : null;

  const shift =
    row.shiftId && typeof row.shiftId === "object" ? row.shiftId : null;

  return {
    ...row,

    face: face || null,
    shift: shift || null,

    faceId: face?._id || row.faceId || null,
    shiftId: shift?._id || row.shiftId || null,

    userId: row.userId || face?.userId || null,
    employeeId: row.employeeId || face?.employeeId || face?.userId || null,

    nameSnapshot: row.nameSnapshot || face?.nameSnapshot || "",
    panNumber: row.panNumber || face?.panNumber || "",
    aadharNumber: row.aadharNumber || face?.aadharNumber || "",
    salary: row.salary || face?.salary || "",

    shiftName: shift?.shiftName || "",
    shiftCode: shift?.shiftCode || "",
  };
};

async function getFaceForPayload(database, body = {}) {
  const faceId = toObjectId(body.faceId || body.faceBackendId);

  if (!faceId) return null;

  return HrmFace.findOne({
    _id: faceId,
    database,
    status: { $ne: "Deleted" },
  }).lean();
}

async function buildPayload(body = {}, database) {
  const face = await getFaceForPayload(database, body);

  const date = str(body.date || body.attendanceDate) || todayDate();

  const userIdRaw =
    body.userId ||
    body.employeeId ||
    body.employee ||
    body.user ||
    body.staffId ||
    face?.userId ||
    "";

  const employeeIdRaw =
    body.employeeId ||
    body.userId ||
    body.employee ||
    body.user ||
    body.staffId ||
    face?.employeeId ||
    face?.userId ||
    "";

  const userId = toObjectId(userIdRaw);
  const employeeId = toObjectId(employeeIdRaw);
  const faceId = toObjectId(body.faceId || body.faceBackendId || face?._id);
  const shiftId = toObjectId(body.shiftId || face?.shiftId);

  const inTime = normalizeTime(body.inTime || body.checkInTime || "");
  const outTime = normalizeTime(body.outTime || body.checkOutTime || "");

  const expectedInTime = normalizeTime(body.expectedInTime || "");
  const expectedOutTime = normalizeTime(body.expectedOutTime || "");

  const lateByMinutes =
    body.lateByMinutes !== undefined
      ? num(body.lateByMinutes)
      : calculateLate(inTime, expectedInTime);

  const earlyOutMinutes =
    body.earlyOutMinutes !== undefined
      ? num(body.earlyOutMinutes)
      : body.earlyByMinutes !== undefined
        ? num(body.earlyByMinutes)
        : calculateEarlyOut(outTime, expectedOutTime);

  const workingMinutes =
    body.workingMinutes !== undefined
      ? num(body.workingMinutes)
      : calculateWorkingMinutes({
          inTime,
          outTime,
          expectedInTime,
          expectedOutTime,
        });

  const isHalfDay =
    bool(body.isHalfDay) ||
    bool(body.manualHalfDay) ||
    String(body.attendanceType || "")
      .toLowerCase()
      .includes("half");

  const attendanceType = isHalfDay
    ? "Half Day"
    : body.attendanceType || "Full Day";

  const photoUrl =
    body.photoUrl ||
    body.photoUri ||
    body.checkInPhotoUrl ||
    body.checkOutPhotoUrl ||
    "";

  return {
    database,

    userId,
    employeeId,
    faceId,
    shiftId,

    panNumber: str(
      body.panNumber || body.pan || face?.panNumber || "",
    ).toUpperCase(),

    aadharNumber: str(
      body.aadharNumber ||
        body.aadhaarNumber ||
        body.aadharNo ||
        body.aadhaarNo ||
        face?.aadharNumber ||
        "",
    ),

    nameSnapshot: str(
      body.nameSnapshot ||
        body.name ||
        body.employeeName ||
        face?.nameSnapshot ||
        "",
    ),

    salary: str(body.salary || body.salaryAmount || face?.salary || ""),

    date,
    attendanceDate: date,

    inTime,
    outTime,

    expectedInTime,
    expectedOutTime,

    lateByMinutes,
    earlyOutMinutes,
    earlyByMinutes: earlyOutMinutes,

    workingMinutes,
    workingHours: Number((workingMinutes / 60).toFixed(2)),
    workingHoursText: minutesToHoursText(workingMinutes),

    attendanceType,
    isHalfDay,
    isManualHalfDay: bool(body.isManualHalfDay || body.manualHalfDay),
    isLateHalfDay: bool(body.isLateHalfDay),

    halfDayReason: str(body.halfDayReason || ""),
    halfDayId: toObjectId(body.halfDayId),

    halfDayMinutes: num(body.halfDayMinutes || (isHalfDay ? 240 : 0)),
    halfDayTime: str(body.halfDayTime || ""),

    checkInPhotoUrl: str(
      body.checkInPhotoUrl ||
        (!outTime ? body.photoUri || body.photoUrl || "" : ""),
    ),

    checkOutPhotoUrl: str(
      body.checkOutPhotoUrl ||
        (outTime ? body.photoUri || body.photoUrl || "" : ""),
    ),

    photoUrl: str(photoUrl),

    score: num(body.score || body.checkInScore || body.checkOutScore),
    threshold: num(body.threshold),

    location: {
      latitude:
        body.location?.latitude !== undefined
          ? num(body.location.latitude)
          : body.latitude !== undefined
            ? num(body.latitude)
            : null,

      longitude:
        body.location?.longitude !== undefined
          ? num(body.location.longitude)
          : body.longitude !== undefined
            ? num(body.longitude)
            : null,

      address: str(body.location?.address || body.address || ""),

      distanceMeters:
        body.location?.distanceMeters !== undefined
          ? num(body.location.distanceMeters)
          : body.distanceMeters !== undefined
            ? num(body.distanceMeters)
            : null,
    },

    deviceId: str(body.deviceId || ""),

    liveness:
      typeof body.liveness === "object" && body.liveness ? body.liveness : {},

    correctionReason: str(body.correctionReason || ""),
    editedManually: bool(body.editedManually),
    correctionSource: str(body.correctionSource || ""),

    status:
      body.status ||
      (outTime ? "Completed" : inTime ? "Checked In" : "Checked In"),

    markedAt: str(body.markedAt || new Date().toISOString()),

    checkInAt: str(body.checkInAt || (inTime ? new Date().toISOString() : "")),
    checkOutAt: str(
      body.checkOutAt || (outTime ? new Date().toISOString() : ""),
    ),
  };
}

export const createAttendance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const payload = await buildPayload(req.body, database);

    if (!payload.faceId) {
      return fail(
        res,
        400,
        "Valid faceId is required. Attendance must be marked from a saved face.",
      );
    }

    if (!payload.userId) {
      return fail(
        res,
        400,
        "Valid userId is missing. Please re-save this face after fetching PAN.",
      );
    }

    const existing = await HrmAttendance.findOne({
      database,
      faceId: payload.faceId,
      date: payload.date,
      status: { $ne: "Deleted" },
    });

    if (existing) {
      existing.userId = payload.userId || existing.userId;
      existing.employeeId = payload.employeeId || existing.employeeId;
      existing.faceId = payload.faceId || existing.faceId;
      existing.shiftId = payload.shiftId || existing.shiftId;

      existing.panNumber = payload.panNumber || existing.panNumber;
      existing.aadharNumber = payload.aadharNumber || existing.aadharNumber;
      existing.nameSnapshot = payload.nameSnapshot || existing.nameSnapshot;
      existing.salary = payload.salary || existing.salary;

      if (payload.inTime) existing.inTime = payload.inTime;
      if (payload.outTime) existing.outTime = payload.outTime;

      existing.expectedInTime =
        payload.expectedInTime || existing.expectedInTime;
      existing.expectedOutTime =
        payload.expectedOutTime || existing.expectedOutTime;

      existing.lateByMinutes = payload.lateByMinutes;
      existing.earlyOutMinutes = payload.earlyOutMinutes;
      existing.earlyByMinutes = payload.earlyByMinutes;

      existing.workingMinutes = payload.workingMinutes;
      existing.workingHours = payload.workingHours;
      existing.workingHoursText = payload.workingHoursText;

      existing.attendanceType = payload.attendanceType;
      existing.isHalfDay = payload.isHalfDay;
      existing.isManualHalfDay = payload.isManualHalfDay;
      existing.isLateHalfDay = payload.isLateHalfDay;

      existing.halfDayReason = payload.halfDayReason || existing.halfDayReason;
      existing.halfDayId = payload.halfDayId || existing.halfDayId;
      existing.halfDayMinutes = payload.halfDayMinutes;
      existing.halfDayTime = payload.halfDayTime;

      if (payload.checkInPhotoUrl && !payload.outTime) {
        existing.checkInPhotoUrl = payload.checkInPhotoUrl;
      }

      if (payload.checkOutPhotoUrl || (payload.photoUrl && payload.outTime)) {
        existing.checkOutPhotoUrl =
          payload.checkOutPhotoUrl || payload.photoUrl;
      }

      if (payload.photoUrl) existing.photoUrl = payload.photoUrl;

      existing.score = payload.score;
      existing.threshold = payload.threshold;
      existing.location = payload.location;
      existing.deviceId = payload.deviceId || existing.deviceId;
      existing.liveness = payload.liveness;

      existing.correctionReason =
        payload.correctionReason || existing.correctionReason;
      existing.editedManually = payload.editedManually;
      existing.correctionSource =
        payload.correctionSource || existing.correctionSource;

      existing.status = payload.outTime ? "Completed" : payload.status;
      existing.markedAt = payload.markedAt;

      if (payload.inTime && !existing.checkInAt) {
        existing.checkInAt = payload.checkInAt;
      }

      if (payload.outTime) {
        existing.checkOutAt = payload.checkOutAt;
      }

      await existing.save();

      const populated = await populateAttendanceQuery(
        HrmAttendance.findById(existing._id),
      ).lean();

      return success(
        res,
        "Attendance updated successfully.",
        normalizePopulatedAttendance(populated),
        { updated: true },
      );
    }

    const row = await HrmAttendance.create(payload);

    const populated = await populateAttendanceQuery(
      HrmAttendance.findById(row._id),
    ).lean();

    return success(
      res,
      "Attendance saved successfully.",
      normalizePopulatedAttendance(populated),
    );
  } catch (error) {
    return fail(res, 500, "Unable to save attendance.", error);
  }
};

export const listAttendance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const filter = {
      database,
      status: { $ne: "Deleted" },
    };

    if (req.query.from || req.query.to) {
      filter.date = {};

      if (req.query.from) filter.date.$gte = str(req.query.from);
      if (req.query.to) filter.date.$lte = str(req.query.to);
    }

    if (req.query.faceId && isValidObjectId(req.query.faceId)) {
      filter.faceId = toObjectId(req.query.faceId);
    }

    if (req.query.userId && isValidObjectId(req.query.userId)) {
      filter.userId = toObjectId(req.query.userId);
    }

    const rows = await populateAttendanceQuery(
      HrmAttendance.find(filter).sort({ date: -1, createdAt: -1 }),
    ).lean();

    return success(
      res,
      "Attendance fetched successfully.",
      rows.map(normalizePopulatedAttendance),
    );
  } catch (error) {
    return fail(res, 500, "Unable to fetch attendance.", error);
  }
};

export const getAttendanceById = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return fail(res, 400, "Valid attendance id is required.");
    }

    const row = await populateAttendanceQuery(
      HrmAttendance.findOne({
        _id: id,
        database,
        status: { $ne: "Deleted" },
      }),
    ).lean();

    if (!row) return fail(res, 404, "Attendance not found.");

    return success(
      res,
      "Attendance fetched successfully.",
      normalizePopulatedAttendance(row),
    );
  } catch (error) {
    return fail(res, 500, "Unable to fetch attendance.", error);
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return fail(res, 400, "Valid attendance id is required.");
    }

    const row = await HrmAttendance.findOne({
      _id: id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!row) return fail(res, 404, "Attendance not found.");

    const payload = await buildPayload(
      {
        ...row.toObject(),
        ...req.body,
      },
      database,
    );

    row.userId = payload.userId || row.userId;
    row.employeeId = payload.employeeId || row.employeeId;
    row.faceId = payload.faceId || row.faceId;
    row.shiftId = payload.shiftId || row.shiftId;

    row.panNumber = payload.panNumber;
    row.aadharNumber = payload.aadharNumber;
    row.nameSnapshot = payload.nameSnapshot;
    row.salary = payload.salary;

    row.date = payload.date;
    row.attendanceDate = payload.attendanceDate;

    row.inTime = payload.inTime;
    row.outTime = payload.outTime;

    row.expectedInTime = payload.expectedInTime;
    row.expectedOutTime = payload.expectedOutTime;

    row.lateByMinutes = payload.lateByMinutes;
    row.earlyOutMinutes = payload.earlyOutMinutes;
    row.earlyByMinutes = payload.earlyByMinutes;

    row.workingMinutes = payload.workingMinutes;
    row.workingHours = payload.workingHours;
    row.workingHoursText = payload.workingHoursText;

    row.attendanceType = payload.attendanceType;
    row.isHalfDay = payload.isHalfDay;
    row.isManualHalfDay = payload.isManualHalfDay;
    row.isLateHalfDay = payload.isLateHalfDay;

    row.halfDayReason = payload.halfDayReason;
    row.halfDayId = payload.halfDayId;
    row.halfDayMinutes = payload.halfDayMinutes;
    row.halfDayTime = payload.halfDayTime;

    row.checkInPhotoUrl = payload.checkInPhotoUrl || row.checkInPhotoUrl;
    row.checkOutPhotoUrl = payload.checkOutPhotoUrl || row.checkOutPhotoUrl;
    row.photoUrl = payload.photoUrl || row.photoUrl;

    row.score = payload.score;
    row.threshold = payload.threshold;
    row.location = payload.location;
    row.deviceId = payload.deviceId;
    row.liveness = payload.liveness;

    row.correctionReason = payload.correctionReason;
    row.editedManually = payload.editedManually;
    row.correctionSource = payload.correctionSource;

    row.status = payload.status;
    row.markedAt = payload.markedAt;

    if (payload.inTime && !row.checkInAt) row.checkInAt = payload.checkInAt;
    if (payload.outTime) row.checkOutAt = payload.checkOutAt;

    await row.save();

    const populated = await populateAttendanceQuery(
      HrmAttendance.findById(row._id),
    ).lean();

    return success(
      res,
      "Attendance updated successfully.",
      normalizePopulatedAttendance(populated),
    );
  } catch (error) {
    return fail(res, 500, "Unable to update attendance.", error);
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return fail(res, 400, "Valid attendance id is required.");
    }

    const row = await HrmAttendance.findOne({
      _id: id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!row) return fail(res, 404, "Attendance not found.");

    row.status = "Deleted";
    await row.save();

    return success(res, "Attendance deleted successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to delete attendance.", error);
  }
};

export const saveAttendance = createAttendance;
export const markAttendance = createAttendance;
export const viewAttendance = getAttendanceById;
