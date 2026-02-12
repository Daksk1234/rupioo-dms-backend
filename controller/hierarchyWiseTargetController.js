// File: controllers/hierarchyWiseTargetController.js
import { HierarchyTargetAllocation } from "../model/HierarchyTargetAllocation.model.js";
import { HierarchyTargetOverride } from "../model/HierarchyTargetOverride.model.js";

const ok = (res, data) => res.json({ ok: true, ...data });
const bad = (res, msg = "Bad Request", code = 400) =>
  res.status(code).json({ ok: false, message: msg });

const mustStr = (v) => (v === null || v === undefined ? "" : String(v).trim());
const mustNum = (v) => (Number.isFinite(+v) ? +v : null);

const makeNestedOverrideObj = (docs) => {
  const out = { salesperson: {}, customer: {} };
  (docs || []).forEach((d) => {
    const rk = mustStr(d.roleKey);
    if (!out[rk]) return;
    const entityId = mustStr(d.entityId);
    const monthLabel = mustStr(d.monthLabel);
    const productId = mustStr(d.productId);
    if (!entityId || !monthLabel || !productId) return;

    if (!out[rk][entityId]) out[rk][entityId] = {};
    if (!out[rk][entityId][monthLabel]) out[rk][entityId][monthLabel] = {};
    out[rk][entityId][monthLabel][productId] = d.qty;
  });
  return out;
};

/* ========================= OVERRIDES ========================= */

export const getOverrides = async (req, res) => {
  try {
    const database = mustStr(req.query.database);
    const fyStartYear = mustNum(req.query.fyStartYear);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");

    const docs = await HierarchyTargetOverride.find({ database, fyStartYear })
      .select(
        "roleKey entityId monthLabel productId qty updatedAt createdAt -_id",
      )
      .lean();

    return ok(res, { overrides: makeNestedOverrideObj(docs) });
  } catch (e) {
    console.error("getOverrides error:", e);
    return bad(res, "Server error", 500);
  }
};

export const upsertOverride = async (req, res) => {
  try {
    const database = mustStr(req.body.database);
    const fyStartYear = mustNum(req.body.fyStartYear);
    const roleKey = mustStr(req.body.roleKey);
    const entityId = mustStr(req.body.entityId);
    const monthLabel = mustStr(req.body.monthLabel);
    const productId = mustStr(req.body.productId);
    const qtyRaw = req.body.qty;
    const updatedBy = mustStr(req.body.updatedBy);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");
    if (!roleKey || !entityId || !monthLabel || !productId)
      return bad(res, "roleKey, entityId, monthLabel, productId required");
    if (roleKey !== "salesperson" && roleKey !== "customer")
      return bad(res, "roleKey must be salesperson|customer");

    // qty null => delete
    const qty =
      qtyRaw === null || qtyRaw === undefined || qtyRaw === ""
        ? null
        : mustNum(qtyRaw);

    if (qty === null) {
      await HierarchyTargetOverride.deleteOne({
        database,
        fyStartYear,
        roleKey,
        entityId,
        monthLabel,
        productId,
      });
      return ok(res, { removed: true });
    }

    if (!Number.isFinite(qty) || qty < 0) return bad(res, "qty must be >= 0");

    await HierarchyTargetOverride.updateOne(
      { database, fyStartYear, roleKey, entityId, monthLabel, productId },
      { $set: { qty, updatedBy } },
      { upsert: true },
    );

    return ok(res, { saved: true });
  } catch (e) {
    console.error("upsertOverride error:", e);
    return bad(res, "Server error", 500);
  }
};

export const clearEntityOverrides = async (req, res) => {
  try {
    const database = mustStr(req.query.database);
    const fyStartYear = mustNum(req.query.fyStartYear);
    const roleKey = mustStr(req.params.roleKey);
    const entityId = mustStr(req.params.entityId);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");
    if (!roleKey || !entityId) return bad(res, "roleKey & entityId required");

    const r = await HierarchyTargetOverride.deleteMany({
      database,
      fyStartYear,
      roleKey,
      entityId,
    });

    return ok(res, { deleted: r.deletedCount || 0 });
  } catch (e) {
    console.error("clearEntityOverrides error:", e);
    return bad(res, "Server error", 500);
  }
};

export const clearEntityMonthOverrides = async (req, res) => {
  try {
    const database = mustStr(req.query.database);
    const fyStartYear = mustNum(req.query.fyStartYear);
    const roleKey = mustStr(req.params.roleKey);
    const entityId = mustStr(req.params.entityId);
    const monthLabel = mustStr(req.params.monthLabel);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");
    if (!roleKey || !entityId || !monthLabel)
      return bad(res, "roleKey & entityId & monthLabel required");

    const r = await HierarchyTargetOverride.deleteMany({
      database,
      fyStartYear,
      roleKey,
      entityId,
      monthLabel,
    });

    return ok(res, { deleted: r.deletedCount || 0 });
  } catch (e) {
    console.error("clearEntityMonthOverrides error:", e);
    return bad(res, "Server error", 500);
  }
};

/* ========================= ALLOCATIONS (SAVED FOR EVERYONE) =========================
   Frontend sends computed records (after rebalance), backend bulk-upserts.
*/

export const bulkUpsertAllocations = async (req, res) => {
  try {
    const database = mustStr(req.body.database);
    const fyStartYear = mustNum(req.body.fyStartYear);
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    const algorithmVersion = mustStr(req.body.algorithmVersion || "hwt_v1");
    const computedAt = req.body.computedAt
      ? new Date(req.body.computedAt)
      : new Date();
    const updatedBy = mustStr(req.body.updatedBy);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");
    if (!records.length) return ok(res, { upserted: 0 });

    // bulkWrite (advanced + fast)
    const ops = [];
    for (const r of records) {
      const roleKey = mustStr(r.roleKey);
      const entityType = mustStr(r.entityType);
      const entityId = mustStr(r.entityId);
      const monthLabel = mustStr(r.monthLabel);

      if (!roleKey || !entityType || !entityId || !monthLabel) continue;

      ops.push({
        updateOne: {
          filter: { database, fyStartYear, roleKey, entityId, monthLabel },
          update: {
            $set: {
              database,
              fyStartYear,
              roleKey,
              entityType,
              entityId,
              monthLabel,
              parentId: mustStr(r.parentId || ""),
              totals: {
                amount: Number(r?.totals?.amount || 0),
                qty: Number(r?.totals?.qty || 0),
              },
              products: Array.isArray(r.products) ? r.products : [],
              toggles: r.toggles || {},
              algorithmVersion,
              computedAt,
              updatedBy,
            },
          },
          upsert: true,
        },
      });
    }

    if (!ops.length) return ok(res, { upserted: 0 });

    const result = await HierarchyTargetAllocation.bulkWrite(ops, {
      ordered: false,
    });

    const upserted = (result.upsertedCount || 0) + (result.modifiedCount || 0);

    return ok(res, { upserted });
  } catch (e) {
    console.error("bulkUpsertAllocations error:", e);
    return bad(res, "Server error", 500);
  }
};

export const getAllocations = async (req, res) => {
  try {
    const database = mustStr(req.query.database);
    const fyStartYear = mustNum(req.query.fyStartYear);
    const roleKey = mustStr(req.query.roleKey);
    const entityId = mustStr(req.query.entityId);
    const monthLabel = mustStr(req.query.monthLabel);

    if (!database || fyStartYear === null)
      return bad(res, "database & fyStartYear required");

    const q = { database, fyStartYear };
    if (roleKey) q.roleKey = roleKey;
    if (entityId) q.entityId = entityId;
    if (monthLabel) q.monthLabel = monthLabel;

    const docs = await HierarchyTargetAllocation.find(q)
      .sort({ monthLabel: 1 })
      .lean();

    return ok(res, { data: docs });
  } catch (e) {
    console.error("getAllocations error:", e);
    return bad(res, "Server error", 500);
  }
};
