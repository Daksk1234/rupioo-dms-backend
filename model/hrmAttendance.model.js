// File: model/hrmAttendance.model.js

import mongoose from "mongoose";

const hrmAttendanceSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    faceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hrmFace",
      default: null,
      index: true,
    },

    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hrmShift",
      default: null,
      index: true,
    },

    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },

    aadharNumber: {
      type: String,
      trim: true,
      default: "",
    },

    nameSnapshot: {
      type: String,
      default: "",
    },

    salary: {
      type: String,
      default: "",
    },

    date: {
      type: String,
      required: true,
      index: true,
    },

    attendanceDate: {
      type: String,
      default: "",
    },

    inTime: {
      type: String,
      default: "",
    },

    outTime: {
      type: String,
      default: "",
    },

    expectedInTime: {
      type: String,
      default: "",
    },

    expectedOutTime: {
      type: String,
      default: "",
    },

    lateByMinutes: {
      type: Number,
      default: 0,
    },

    earlyOutMinutes: {
      type: Number,
      default: 0,
    },

    earlyByMinutes: {
      type: Number,
      default: 0,
    },

    workingMinutes: {
      type: Number,
      default: 0,
    },

    workingHours: {
      type: Number,
      default: 0,
    },

    workingHoursText: {
      type: String,
      default: "",
    },

    attendanceType: {
      type: String,
      enum: ["Full Day", "Half Day", "Absent", "Leave", "WFH"],
      default: "Full Day",
    },

    isHalfDay: {
      type: Boolean,
      default: false,
    },

    isManualHalfDay: {
      type: Boolean,
      default: false,
    },

    isLateHalfDay: {
      type: Boolean,
      default: false,
    },

    halfDayReason: {
      type: String,
      default: "",
    },

    halfDayId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    halfDayMinutes: {
      type: Number,
      default: 0,
    },

    halfDayTime: {
      type: String,
      default: "",
    },

    checkInPhotoUrl: {
      type: String,
      default: "",
    },

    checkOutPhotoUrl: {
      type: String,
      default: "",
    },

    photoUrl: {
      type: String,
      default: "",
    },

    score: {
      type: Number,
      default: 0,
    },

    threshold: {
      type: Number,
      default: 0,
    },

    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      address: { type: String, default: "" },
      distanceMeters: { type: Number, default: null },
    },

    deviceId: {
      type: String,
      default: "",
    },

    liveness: {
      type: Object,
      default: {},
    },

    correctionReason: {
      type: String,
      default: "",
    },

    editedManually: {
      type: Boolean,
      default: false,
    },

    correctionSource: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Checked In", "Completed", "Absent", "Deleted"],
      default: "Checked In",
      index: true,
    },

    markedAt: {
      type: String,
      default: "",
    },

    checkInAt: {
      type: String,
      default: "",
    },

    checkOutAt: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

hrmAttendanceSchema.index(
  { database: 1, faceId: 1, date: 1, status: 1 },
  { name: "hrm_attendance_face_date_idx" },
);

hrmAttendanceSchema.index(
  { database: 1, userId: 1, date: 1, status: 1 },
  { name: "hrm_attendance_user_date_idx" },
);

// Important during development: refresh old compiled schema
if (mongoose.models.hrmAttendance) {
  delete mongoose.models.hrmAttendance;
}

export const HrmAttendance = mongoose.model(
  "hrmAttendance",
  hrmAttendanceSchema,
);
