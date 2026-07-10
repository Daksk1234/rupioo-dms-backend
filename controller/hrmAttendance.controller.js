// File: controller/hrmAttendance.controller.js

import mongoose from "mongoose";
import { HrmAttendance } from "../model/hrmAttendance.model.js";
import { HrmFace } from "../model/hrmFace.model.js";
import { HrmShift } from "../model/hrmShift.model.js";

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

const toMonthKey = (value = "") => {
  const text = str(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7);

  const d = text ? new Date(text) : new Date();
  if (Number.isNaN(d.getTime())) return todayDate().slice(0, 7);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const nextMonthKey = (month = "") => {
  const safeMonth = toMonthKey(month);
  const [year, monthNo] = safeMonth.split("-").map(Number);
  const d = new Date(year, monthNo, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const daysInMonth = (month = "") => {
  const safeMonth = toMonthKey(month);
  const [year, monthNo] = safeMonth.split("-").map(Number);
  return new Date(year, monthNo, 0).getDate() || 30;
};

const paymentBatchNo = () => {
  const d = new Date();
  return `SAL-${d.getFullYear()}${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(d.getDate()).padStart(2, "0")}-${String(Date.now()).slice(-5)}`;
};

const attendanceSalaryAmount = (row = {}) => {
  const salary = num(row.salary || row.monthlySalary || row.salaryAmount);
  if (!salary) return 0;

  const month = toMonthKey(
    row.date || row.attendanceDate || row.salaryPaymentMonth,
  );
  const perDay = salary / (daysInMonth(month) || 30);
  const type = str(row.attendanceType).toLowerCase();

  if (row.status === "Deleted") return 0;
  if (type.includes("absent") || type.includes("leave")) return 0;
  if (!row.inTime && !row.outTime && !type.includes("half")) return 0;
  if (row.isHalfDay || type.includes("half"))
    return Number((perDay / 2).toFixed(2));

  return Number(perDay.toFixed(2));
};

const getSalaryPaymentEmployeeKey = (row = {}) => {
  return str(
    row.employeeId ||
      row.employeeIdText ||
      row.userId ||
      row.faceId ||
      row.panNumber ||
      row.aadharNumber ||
      row.nameSnapshot ||
      "",
  );
};

const getLatestTextDate = (rows = [], field = "") => {
  return (
    rows
      .map((row) => str(row?.[field]))
      .filter(Boolean)
      .sort()
      .pop() || ""
  );
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

const calculateLunchLate = ({
  lunchOut,
  lunchIn,
  outTime,
  expectedLunchIn,
}) => {
  if (!lunchOut || !expectedLunchIn) return 0;

  const actualReturn = minutesFromTime(lunchIn || outTime);
  const expectedReturn = minutesFromTime(expectedLunchIn);

  if (actualReturn === null || expectedReturn === null) return 0;

  let adjustedActualReturn = actualReturn;

  if (adjustedActualReturn < expectedReturn) {
    const difference = expectedReturn - adjustedActualReturn;

    if (difference > 12 * 60) {
      adjustedActualReturn += 24 * 60;
    }
  }

  return Math.max(adjustedActualReturn - expectedReturn, 0);
};

const getShiftDayForDate = (shift = {}, date = "") => {
  const days = Array.isArray(shift?.days) ? shift.days : [];
  if (!days.length) return null;

  const parsedDate = new Date(`${date || todayDate()}T12:00:00`);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const jsDay = safeDate.getDay();
  const dayNo = jsDay === 0 ? 7 : jsDay;
  const dayName = safeDate
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  return (
    days.find((item) => Number(item?.dayNo) === dayNo) ||
    days.find(
      (item) =>
        String(item?.day || "")
          .trim()
          .toLowerCase() === dayName,
    ) ||
    null
  );
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

async function getShiftForPayload(database, body = {}, face = null) {
  const shiftId = toObjectId(body.shiftId || face?.shiftId);

  if (!shiftId) return null;

  return HrmShift.findOne({
    _id: shiftId,
    database,
    status: { $ne: "Deleted" },
  }).lean();
}

async function buildPayload(body = {}, database) {
  const face = await getFaceForPayload(database, body);

  const date = str(body.date || body.attendanceDate) || todayDate();
  const shift = await getShiftForPayload(database, body, face);
  const shiftDay = getShiftDayForDate(shift, date);

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
  const lunchOut = normalizeTime(
    body.lunchOut || body.lunchOutTime || body.lunch_out || "",
  );
  const lunchIn = normalizeTime(
    body.lunchIn || body.lunchInTime || body.lunch_in || "",
  );
  const outTime = normalizeTime(body.outTime || body.checkOutTime || "");

  const expectedInTime = normalizeTime(
    body.expectedInTime || shiftDay?.inTime || "",
  );
  const expectedLunchOut = normalizeTime(
    body.expectedLunchOut ||
      body.expectedLunchOutTime ||
      shiftDay?.lunchOut ||
      shiftDay?.lunch_out ||
      "",
  );
  const expectedLunchIn = normalizeTime(
    body.expectedLunchIn ||
      body.expectedLunchInTime ||
      shiftDay?.lunchIn ||
      shiftDay?.lunch_in ||
      "",
  );
  const expectedOutTime = normalizeTime(
    body.expectedOutTime || shiftDay?.outTime || "",
  );

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

  const lunchLateMinutes =
    body.lunchLateMinutes !== undefined
      ? num(body.lunchLateMinutes)
      : calculateLunchLate({
          lunchOut,
          lunchIn,
          outTime,
          expectedLunchIn,
        });

  const lunchDeductionMinutes =
    body.lunchDeductionMinutes !== undefined
      ? num(body.lunchDeductionMinutes)
      : lunchLateMinutes;

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
    lunchOut,
    lunchIn,
    outTime,

    expectedInTime,
    expectedLunchOut,
    expectedLunchIn,
    expectedOutTime,

    lunchLateMinutes,
    lunchDeductionMinutes,

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
        (inTime && !lunchOut && !lunchIn && !outTime
          ? body.photoUri || body.photoUrl || ""
          : ""),
    ),

    lunchOutPhotoUrl: str(
      body.lunchOutPhotoUrl ||
        (lunchOut && !lunchIn && !outTime
          ? body.photoUri || body.photoUrl || ""
          : ""),
    ),

    lunchInPhotoUrl: str(
      body.lunchInPhotoUrl ||
        (lunchIn && !outTime ? body.photoUri || body.photoUrl || "" : ""),
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
    lunchOutAt: str(
      body.lunchOutAt || (lunchOut ? new Date().toISOString() : ""),
    ),
    lunchInAt: str(body.lunchInAt || (lunchIn ? new Date().toISOString() : "")),
    checkOutAt: str(
      body.checkOutAt || (outTime ? new Date().toISOString() : ""),
    ),

    salaryPaymentStatus: ["Paid", "Unpaid"].includes(body.salaryPaymentStatus)
      ? body.salaryPaymentStatus
      : "Unpaid",
    salaryPaymentMonth: str(body.salaryPaymentMonth || date.slice(0, 7)),
    salaryPaymentAmount: num(body.salaryPaymentAmount),
    salaryPaymentRemark: str(body.salaryPaymentRemark || ""),
    salaryPaymentBatchNo: str(body.salaryPaymentBatchNo || ""),
    salaryPaidOn: str(body.salaryPaidOn || ""),
    salaryPaidAt: str(body.salaryPaidAt || ""),
    salaryPaidBy: toObjectId(body.salaryPaidBy),
    salaryPaidByName: str(body.salaryPaidByName || ""),
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
      if (payload.lunchOut) existing.lunchOut = payload.lunchOut;
      if (payload.lunchIn) existing.lunchIn = payload.lunchIn;
      if (payload.outTime) existing.outTime = payload.outTime;

      existing.expectedInTime =
        payload.expectedInTime || existing.expectedInTime;
      existing.expectedLunchOut =
        payload.expectedLunchOut || existing.expectedLunchOut;
      existing.expectedLunchIn =
        payload.expectedLunchIn || existing.expectedLunchIn;
      existing.expectedOutTime =
        payload.expectedOutTime || existing.expectedOutTime;

      existing.lunchLateMinutes = payload.lunchLateMinutes;
      existing.lunchDeductionMinutes = payload.lunchDeductionMinutes;

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

      if (payload.lunchOutPhotoUrl) {
        existing.lunchOutPhotoUrl = payload.lunchOutPhotoUrl;
      }

      if (payload.lunchInPhotoUrl) {
        existing.lunchInPhotoUrl = payload.lunchInPhotoUrl;
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

      if (payload.lunchOut && !existing.lunchOutAt) {
        existing.lunchOutAt = payload.lunchOutAt;
      }

      if (payload.lunchIn && !existing.lunchInAt) {
        existing.lunchInAt = payload.lunchInAt;
      }

      if (payload.outTime) {
        existing.checkOutAt = payload.checkOutAt;
      }

      if (!existing.salaryPaymentMonth) {
        existing.salaryPaymentMonth = payload.salaryPaymentMonth;
      }
      if (!existing.salaryPaymentStatus) {
        existing.salaryPaymentStatus = "Unpaid";
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
    row.lunchOut = payload.lunchOut;
    row.lunchIn = payload.lunchIn;
    row.outTime = payload.outTime;

    row.expectedInTime = payload.expectedInTime;
    row.expectedLunchOut = payload.expectedLunchOut;
    row.expectedLunchIn = payload.expectedLunchIn;
    row.expectedOutTime = payload.expectedOutTime;

    row.lunchLateMinutes = payload.lunchLateMinutes;
    row.lunchDeductionMinutes = payload.lunchDeductionMinutes;

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
    row.lunchOutPhotoUrl = payload.lunchOutPhotoUrl || row.lunchOutPhotoUrl;
    row.lunchInPhotoUrl = payload.lunchInPhotoUrl || row.lunchInPhotoUrl;
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
    if (payload.lunchOut && !row.lunchOutAt) {
      row.lunchOutAt = payload.lunchOutAt;
    }
    if (payload.lunchIn && !row.lunchInAt) {
      row.lunchInAt = payload.lunchInAt;
    }
    if (payload.outTime) row.checkOutAt = payload.checkOutAt;

    row.salaryPaymentMonth = payload.salaryPaymentMonth || row.date.slice(0, 7);
    row.salaryPaymentStatus = row.salaryPaymentStatus || "Unpaid";

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

export const listSalaryMonthPayments = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const filter = {
      database,
      status: { $ne: "Deleted" },
    };

    const month = str(req.query.month || req.query.salaryMonth || "");
    if (month) {
      const safeMonth = toMonthKey(month);
      filter.date = {
        $gte: `${safeMonth}-01`,
        $lt: `${nextMonthKey(safeMonth)}-01`,
      };
    } else if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = str(req.query.from);
      if (req.query.to) filter.date.$lte = str(req.query.to);
    }

    if (req.query.userId && isValidObjectId(req.query.userId)) {
      filter.userId = toObjectId(req.query.userId);
    }

    if (req.query.employeeId && isValidObjectId(req.query.employeeId)) {
      filter.employeeId = toObjectId(req.query.employeeId);
    }

    if (req.query.faceId && isValidObjectId(req.query.faceId)) {
      filter.faceId = toObjectId(req.query.faceId);
    }

    const rows = await HrmAttendance.find(filter)
      .sort({ date: -1, nameSnapshot: 1, createdAt: -1 })
      .lean();

    const grouped = new Map();

    rows.forEach((row) => {
      const salaryMonth = str(row.salaryPaymentMonth) || toMonthKey(row.date);
      const employeeKey = getSalaryPaymentEmployeeKey(row);
      if (!salaryMonth || !employeeKey) return;

      const key = `${employeeKey}_${salaryMonth}`;
      const amount = attendanceSalaryAmount(row);

      if (!grouped.has(key)) {
        grouped.set(key, {
          _id: key,
          groupKey: key,
          database,
          month: salaryMonth,
          salaryMonth,
          date: `${salaryMonth}-01`,

          userId: row.userId || null,
          employeeId: row.employeeId || row.userId || null,
          employeeIdText: str(row.employeeId || row.userId || ""),
          faceId: row.faceId || null,
          employeeName: str(row.nameSnapshot || "Employee"),
          panNumber: str(row.panNumber || ""),
          aadharNumber: str(row.aadharNumber || ""),
          salary: row.salary || "",

          payableAmount: 0,
          amount: 0,
          attendanceCount: 0,
          paidCount: 0,
          unpaidCount: 0,
          presentCount: 0,
          halfDayCount: 0,
          absentCount: 0,
          attendanceIds: [],
          paymentStatus: "Unpaid",
          salaryPaymentStatus: "Unpaid",
          paidOn: "",
          paidAt: "",
          salaryPaidOn: "",
          salaryPaidAt: "",
          paymentRemark: "",
          salaryPaymentRemark: "",
          paymentBatchNo: "",
          salaryPaymentBatchNo: "",
          paidByName: "",
          salaryPaidByName: "",
        });
      }

      const item = grouped.get(key);
      const isPaid = str(row.salaryPaymentStatus || "Unpaid") === "Paid";
      const type = str(row.attendanceType).toLowerCase();

      item.payableAmount = Number((item.payableAmount + amount).toFixed(2));
      item.amount = item.payableAmount;
      item.attendanceCount += 1;
      item.attendanceIds.push(row._id);

      if (isPaid) item.paidCount += 1;
      else item.unpaidCount += 1;

      if (row.isHalfDay || type.includes("half")) item.halfDayCount += 1;
      else if (type.includes("absent") || (!row.inTime && !row.outTime)) {
        item.absentCount += 1;
      } else {
        item.presentCount += 1;
      }
    });

    let payments = Array.from(grouped.values()).map((item) => {
      const status =
        item.attendanceCount > 0 && item.unpaidCount === 0 ? "Paid" : "Unpaid";
      const rowsForGroup = rows.filter((row) => {
        const salaryMonth = str(row.salaryPaymentMonth) || toMonthKey(row.date);
        const employeeKey = getSalaryPaymentEmployeeKey(row);
        return `${employeeKey}_${salaryMonth}` === item.groupKey;
      });

      const paidOn = getLatestTextDate(rowsForGroup, "salaryPaidOn");
      const paidAt = getLatestTextDate(rowsForGroup, "salaryPaidAt");
      const remark =
        rowsForGroup
          .map((row) => str(row.salaryPaymentRemark))
          .filter(Boolean)
          .pop() || "";
      const batchNo =
        rowsForGroup
          .map((row) => str(row.salaryPaymentBatchNo))
          .filter(Boolean)
          .pop() || "";
      const paidByName =
        rowsForGroup
          .map((row) => str(row.salaryPaidByName))
          .filter(Boolean)
          .pop() || "";

      return {
        ...item,
        paymentStatus: status,
        salaryPaymentStatus: status,
        paidOn,
        paidAt,
        salaryPaidOn: paidOn,
        salaryPaidAt: paidAt,
        paymentRemark: remark,
        salaryPaymentRemark: remark,
        paymentBatchNo: batchNo,
        salaryPaymentBatchNo: batchNo,
        paidByName,
        salaryPaidByName: paidByName,
      };
    });

    const requestedStatus = str(req.query.status || "All").toLowerCase();
    if (requestedStatus === "paid") {
      payments = payments.filter((row) => row.paymentStatus === "Paid");
    } else if (requestedStatus === "unpaid") {
      payments = payments.filter((row) => row.paymentStatus !== "Paid");
    }

    payments.sort((a, b) => {
      const dateSort = str(b.month).localeCompare(str(a.month));
      if (dateSort !== 0) return dateSort;
      return str(a.employeeName).localeCompare(str(b.employeeName));
    });

    return success(
      res,
      "Salary month payments fetched successfully.",
      payments,
      {
        rows: payments,
        salaryMonths: payments,
      },
    );
  } catch (error) {
    return fail(res, 500, "Unable to fetch salary month payments.", error);
  }
};

export const paySalaryMonth = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const month = toMonthKey(req.body.month || req.body.salaryMonth);

    if (!month) {
      return fail(res, 400, "Salary month is required.");
    }

    const employeeIdRaw = str(
      req.body.employeeId || req.body.employeeIdText || req.body.userId || "",
    );
    const faceIdRaw = str(req.body.faceId || "");
    const employeeName = str(req.body.employeeName || "");

    const or = [];
    const employeeObjectId = toObjectId(employeeIdRaw);
    const faceObjectId = toObjectId(faceIdRaw);

    if (employeeObjectId) {
      or.push({ employeeId: employeeObjectId }, { userId: employeeObjectId });
    }
    if (faceObjectId) or.push({ faceId: faceObjectId });
    if (employeeName) or.push({ nameSnapshot: employeeName });

    if (!or.length) {
      return fail(res, 400, "Employee id or employee name is required.");
    }

    const filter = {
      database,
      status: { $ne: "Deleted" },
      date: {
        $gte: `${month}-01`,
        $lt: `${nextMonthKey(month)}-01`,
      },
      $or: or,
    };

    const existingRows = await HrmAttendance.find(filter).lean();
    if (!existingRows.length) {
      return fail(res, 404, "No attendance found for this employee/month.");
    }

    const paidOn = todayDate();
    const paidAt = new Date().toISOString();
    const batchNo =
      str(req.body.paymentBatchNo || req.body.salaryPaymentBatchNo) ||
      paymentBatchNo();
    const paidBy = toObjectId(req.body.paidBy || req.body.actionBy);
    const paidByName = str(req.body.paidByName || req.body.actionByName || "");
    const paymentRemark = str(
      req.body.paymentRemark || req.body.paidRemark || "",
    );
    const paymentAmount = num(req.body.payableAmount || req.body.amount);

    const result = await HrmAttendance.updateMany(filter, {
      $set: {
        salaryPaymentStatus: "Paid",
        salaryPaymentMonth: month,
        salaryPaymentAmount: paymentAmount,
        salaryPaymentRemark: paymentRemark,
        salaryPaymentBatchNo: batchNo,
        salaryPaidOn: paidOn,
        salaryPaidAt: paidAt,
        salaryPaidBy: paidBy,
        salaryPaidByName: paidByName,
      },
    });

    return success(res, "Salary month marked as paid successfully.", {
      month,
      paidOn,
      paidAt,
      paymentBatchNo: batchNo,
      salaryPaymentBatchNo: batchNo,
      modifiedCount: result.modifiedCount || result.nModified || 0,
      matchedCount: result.matchedCount || result.n || existingRows.length,
    });
  } catch (error) {
    return fail(res, 500, "Unable to pay salary month.", error);
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
