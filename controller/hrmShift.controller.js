// File: controller/hrmShift.controller.js

import { HrmShift } from "../model/hrmShift.model.js";
import {
  cleanDatabase,
  fail,
  isValidObjectId,
  parseJsonArray,
  success,
} from "./_hrmCommon.js";

const DEFAULT_IN_TIME = "09:30";
const DEFAULT_LUNCH_OUT = "13:30";
const DEFAULT_LUNCH_IN = "14:00";
const DEFAULT_OUT_TIME = "18:30";

const defaultDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
].map((day, index) => ({
  day,
  dayNo: index + 1,
  isWorking: index < 6,
  inTime: index < 6 ? DEFAULT_IN_TIME : "",
  lunchOut: index < 6 ? DEFAULT_LUNCH_OUT : "",
  lunchIn: index < 6 ? DEFAULT_LUNCH_IN : "",
  outTime: index < 6 ? DEFAULT_OUT_TIME : "",
}));

/**
 * Safely converts request values into a Boolean.
 *
 * This supports:
 * true, false
 * 1, 0
 * "true", "false"
 * "yes", "no"
 * "on", "off"
 */
const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalizedValue)) {
      return true;
    }

    if (["false", "0", "no", "off", ""].includes(normalizedValue)) {
      return false;
    }
  }

  return fallback;
};

const normalizeDays = (value) => {
  const parsedDays = parseJsonArray(value, defaultDays);
  const sourceDays = Array.isArray(parsedDays) ? parsedDays : defaultDays;

  return defaultDays.map((fallbackDay) => {
    const sourceDay = sourceDays.find(
      (item) =>
        Number(item?.dayNo) === Number(fallbackDay.dayNo) ||
        String(item?.day || "")
          .trim()
          .toLowerCase() === fallbackDay.day.toLowerCase(),
    );

    const isWorking = parseBoolean(sourceDay?.isWorking, fallbackDay.isWorking);

    if (!isWorking) {
      return {
        day: sourceDay?.day || fallbackDay.day,
        dayNo: Number(sourceDay?.dayNo || fallbackDay.dayNo),
        isWorking: false,
        inTime: "",
        lunchOut: "",
        lunchIn: "",
        outTime: "",
      };
    }

    return {
      day: sourceDay?.day || fallbackDay.day,
      dayNo: Number(sourceDay?.dayNo || fallbackDay.dayNo),
      isWorking: true,
      inTime: sourceDay?.inTime || DEFAULT_IN_TIME,
      lunchOut:
        sourceDay?.lunchOut || sourceDay?.lunch_out || DEFAULT_LUNCH_OUT,
      lunchIn: sourceDay?.lunchIn || sourceDay?.lunch_in || DEFAULT_LUNCH_IN,
      outTime: sourceDay?.outTime || DEFAULT_OUT_TIME,
    };
  });
};

const payload = (body, database) => ({
  database,

  shiftName: body.shiftName || body.name || "General Shift",

  shiftCode: body.shiftCode || "",

  description: body.description || "",

  graceInMinutes: Number(body.graceInMinutes || 0),

  graceOutMinutes: Number(body.graceOutMinutes || 0),

  lastMinuteAttendance: body.lastMinuteAttendance || "11:00",

  deductHolidaySalaryOnAdjacentAbsence: parseBoolean(
    body.deductHolidaySalaryOnAdjacentAbsence,
    false,
  ),

  days: normalizeDays(body.days),

  status: body.status || "Active",
});

export const createShift = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const row = await HrmShift.create(payload(req.body, database));

    return success(res, "Shift saved successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to save shift.", error);
  }
};

export const listShifts = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const rows = await HrmShift.find({
      database,
      status: { $ne: "Deleted" },
    })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, "Shift list fetched successfully.", rows);
  } catch (error) {
    return fail(res, 500, "Unable to fetch shifts.", error);
  }
};

export const getShiftById = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid shift id is required.");
    }

    const row = await HrmShift.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    }).lean();

    if (!row) {
      return fail(res, 404, "Shift not found.");
    }

    return success(res, "Shift fetched successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to fetch shift.", error);
  }
};

export const updateShift = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid shift id is required.");
    }

    const row = await HrmShift.findOneAndUpdate(
      {
        _id: req.params.id,
        database,
        status: { $ne: "Deleted" },
      },
      {
        $set: payload(req.body, database),
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!row) {
      return fail(res, 404, "Shift not found.");
    }

    return success(res, "Shift updated successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to update shift.", error);
  }
};

export const deleteShift = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid shift id is required.");
    }

    const row = await HrmShift.findOneAndUpdate(
      {
        _id: req.params.id,
        database,
      },
      {
        $set: {
          status: "Deleted",
        },
      },
      {
        new: true,
      },
    );

    if (!row) {
      return fail(res, 404, "Shift not found.");
    }

    return success(res, "Shift deleted successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to delete shift.", error);
  }
};
