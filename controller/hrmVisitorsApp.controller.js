// File: controllers/hrmVisitorsApp.controller.js
import HrmVisitorsApp from "../model/hrmVisitorsApp.model.js";

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeStatus(value, fallback = "Active") {
  const text = cleanText(value || fallback).toLowerCase();

  if (text === "inactive") return "Inactive";
  if (text === "deleted") return "Deleted";
  return "Active";
}

export const createHrmVisitorApp = async (req, res) => {
  try {
    const { database, created_by, name, mobile, address, photoUri, status } =
      req.body || {};

    if (!database) {
      return res
        .status(400)
        .json({ status: false, message: "Database is required." });
    }

    if (!cleanText(name)) {
      return res
        .status(400)
        .json({ status: false, message: "Visitor name is required." });
    }

    const visitor = await HrmVisitorsApp.create({
      database: cleanText(database),
      created_by: cleanText(created_by),
      name: cleanText(name),
      mobile: cleanText(mobile),
      address: cleanText(address),
      photoUri: cleanText(photoUri),
      status: normalizeStatus(status, "Active"),
      deleted: false,
    });

    return res.status(201).json({
      status: true,
      message: "Visitor created successfully.",
      data: visitor,
      visitor,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error?.message || "Unable to create visitor.",
    });
  }
};

export const viewHrmVisitorsApp = async (req, res) => {
  try {
    const database = cleanText(req.params.database || req.query.database);

    if (!database) {
      return res
        .status(400)
        .json({ status: false, message: "Database is required." });
    }

    const visitors = await HrmVisitorsApp.find({
      database,
      deleted: { $ne: true },
      status: { $ne: "Deleted" },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Visitors fetched successfully.",
      data: visitors,
      visitors,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error?.message || "Unable to fetch visitors.",
    });
  }
};

export const updateHrmVisitorApp = async (req, res) => {
  try {
    const id = req.params.id;

    const allowed = [
      "name",
      "mobile",
      "address",
      "photoUri",
      "status",
      "database",
      "created_by",
    ];

    const update = {};
    allowed.forEach((key) => {
      if (req.body?.[key] !== undefined) {
        update[key] =
          key === "status"
            ? normalizeStatus(req.body[key], "Active")
            : cleanText(req.body[key]);
      }
    });

    const visitor = await HrmVisitorsApp.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!visitor) {
      return res
        .status(404)
        .json({ status: false, message: "Visitor not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Visitor updated successfully.",
      data: visitor,
      visitor,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error?.message || "Unable to update visitor.",
    });
  }
};

export const setHrmVisitorStatusApp = async (req, res) => {
  try {
    const id = req.params.id;
    const status = normalizeStatus(req.body?.status, "Active");

    const visitor = await HrmVisitorsApp.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    );

    if (!visitor) {
      return res
        .status(404)
        .json({ status: false, message: "Visitor not found." });
    }

    return res.status(200).json({
      status: true,
      message: `Visitor marked ${status}.`,
      data: visitor,
      visitor,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error?.message || "Unable to update visitor status.",
    });
  }
};

export const deleteHrmVisitorApp = async (req, res) => {
  try {
    const id = req.params.id;

    const visitor = await HrmVisitorsApp.findByIdAndUpdate(
      id,
      { deleted: true, status: "Deleted" },
      { new: true },
    );

    if (!visitor) {
      return res
        .status(404)
        .json({ status: false, message: "Visitor not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Visitor deleted successfully.",
      data: visitor,
      visitor,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error?.message || "Unable to delete visitor.",
    });
  }
};
