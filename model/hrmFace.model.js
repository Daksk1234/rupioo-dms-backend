// File: model/hrmFace.model.js

import mongoose from "mongoose";

const hrmFaceSchema = new mongoose.Schema(
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

    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hrmShift",
      default: null,
      index: true,
    },

    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },

    aadharNumber: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    nameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    salary: {
      type: String,
      default: "",
    },

    photoUrl: {
      type: String,
      default: "",
    },

    photoFileName: {
      type: String,
      default: "",
    },

    imageMimeType: {
      type: String,
      default: "image/jpeg",
    },

    embedding: {
      type: [Number],
      default: [],
    },

    embeddings: {
      type: [[Number]],
      default: [],
    },

    embeddingModel: {
      type: String,
      default: "mobile_face_net",
    },

    faceQuality: {
      type: Object,
      default: {},
    },

    status: {
      type: String,
      enum: ["Active", "Inactive", "Deleted"],
      default: "Active",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

hrmFaceSchema.index(
  { database: 1, userId: 1, status: 1 },
  { name: "hrm_face_database_user_status_idx" },
);

export const HrmFace =
  mongoose.models.hrmFace || mongoose.model("hrmFace", hrmFaceSchema);
