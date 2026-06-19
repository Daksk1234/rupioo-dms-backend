// File: controller/_hrmAdvancedCommon.js
import mongoose from "mongoose";

export const success = (res, message, data = null, extra = {}) => res.status(200).json({ status: true, message, data, ...extra });
export const fail = (res, code, message, error = null) => res.status(code).json({ status: false, message, error: error ? String(error?.message || error) : undefined });
export const cleanDatabase = (value) => { const db = String(value || "").trim(); if (!db) throw new Error("Database is required."); if (!/^[a-zA-Z0-9_-]+$/.test(db)) throw new Error("Invalid database name."); return db; };
export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));
export const number = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const asArray = (v) => { if (Array.isArray(v)) return v; if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } } return []; };
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const monthKey = () => todayKey().slice(0, 7);

export const buildController = ({ Model, label = "Record", beforeSave }) => {
  const payload = (body, database) => {
    let row = {
      ...body,
      database,
      date: body.date || todayKey(),
      month: body.month || String(body.date || todayKey()).slice(0, 7),
      status: body.status || "Active",
      history: asArray(body.history),
    };
    if (typeof beforeSave === "function") row = beforeSave(row, body) || row;
    return row;
  };

  const create = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      const row = await Model.create(payload(req.body, database));
      return success(res, `${label} saved successfully.`, row);
    } catch (error) { return fail(res, 500, `Unable to save ${label}.`, error); }
  };

  const list = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      const { kind, status, month, date, q } = req.query || {};
      const filter = { database, status: { $ne: "Deleted" } };
      if (kind) filter.kind = kind;
      if (status && status !== "All") filter.status = status;
      if (month) filter.month = month;
      if (date) filter.date = date;
      let query = Model.find(filter);
      if (q) {
        const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query = Model.find({ ...filter, $or: [{ name: rx }, { title: rx }, { employeeName: rx }, { candidateName: rx }, { mobile: rx }, { email: rx }, { remarks: rx }] });
      }
      const rows = await query.sort({ updatedAt: -1, createdAt: -1 }).lean();
      return success(res, `${label} list fetched successfully.`, rows);
    } catch (error) { return fail(res, 500, `Unable to fetch ${label}.`, error); }
  };

  const view = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      if (!isValidObjectId(req.params.id)) return fail(res, 400, "Valid id required.");
      const row = await Model.findOne({ _id: req.params.id, database, status: { $ne: "Deleted" } }).lean();
      if (!row) return fail(res, 404, `${label} not found.`);
      return success(res, `${label} fetched successfully.`, row);
    } catch (error) { return fail(res, 500, `Unable to fetch ${label}.`, error); }
  };

  const update = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      if (!isValidObjectId(req.params.id)) return fail(res, 400, "Valid id required.");
      const old = await Model.findOne({ _id: req.params.id, database, status: { $ne: "Deleted" } });
      if (!old) return fail(res, 404, `${label} not found.`);
      const next = payload(req.body, database);
      next.history = [...(old.history || []), { at: new Date(), action: "Update", oldStatus: old.status, newStatus: next.status, note: next.remarks || next.reason || "" }];
      Object.assign(old, next);
      await old.save();
      return success(res, `${label} updated successfully.`, old);
    } catch (error) { return fail(res, 500, `Unable to update ${label}.`, error); }
  };

  const transition = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      if (!isValidObjectId(req.params.id)) return fail(res, 400, "Valid id required.");
      const { status, stage, note } = req.body;
      const row = await Model.findOne({ _id: req.params.id, database, status: { $ne: "Deleted" } });
      if (!row) return fail(res, 404, `${label} not found.`);
      row.history = [...(row.history || []), { at: new Date(), action: "Transition", oldStatus: row.status, newStatus: status || row.status, oldStage: row.stage, newStage: stage || row.stage, note: note || "" }];
      if (status) row.status = status;
      if (stage) row.stage = stage;
      await row.save();
      return success(res, `${label} status updated.`, row);
    } catch (error) { return fail(res, 500, `Unable to update ${label} status.`, error); }
  };

  const remove = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      if (!isValidObjectId(req.params.id)) return fail(res, 400, "Valid id required.");
      const row = await Model.findOneAndUpdate({ _id: req.params.id, database }, { $set: { status: "Deleted" }, $push: { history: { at: new Date(), action: "Delete" } } }, { new: true });
      if (!row) return fail(res, 404, `${label} not found.`);
      return success(res, `${label} deleted successfully.`, row);
    } catch (error) { return fail(res, 500, `Unable to delete ${label}.`, error); }
  };

  const report = async (req, res) => {
    try {
      const database = cleanDatabase(req.params.database);
      const rows = await Model.find({ database, status: { $ne: "Deleted" } }).lean();
      const byStatus = rows.reduce((acc, r) => { const k = r.status || "Blank"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
      const byKind = rows.reduce((acc, r) => { const k = r.kind || "main"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
      return success(res, `${label} report fetched successfully.`, { total: rows.length, byStatus, byKind, rows });
    } catch (error) { return fail(res, 500, `Unable to fetch ${label} report.`, error); }
  };
  return { create, list, view, update, transition, remove, report };
};
