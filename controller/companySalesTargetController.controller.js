import { CompanySalesTarget } from "../model/CompanySalesTarget.model.js";

export const getCompanySalesTarget = async (req, res) => {
  try {
    const fy = req.query.fy;
    const database =
      req.query.database ||
      req.body.database ||
      req.headers["x-database"] ||
      req.headers["database"];

    if (!fy)
      return res.status(400).json({ ok: false, message: "fy is required" });
    if (!database)
      return res
        .status(400)
        .json({ ok: false, message: "database is required" });

    const doc = await CompanySalesTarget.findOne({ database, fy }).lean();

    return res.json({ ok: true, data: doc || null });
  } catch (e) {
    console.error("getCompanySalesTarget error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

export const upsertCompanySalesTarget = async (req, res) => {
  try {
    const { fy, database, yearPlan, monthPlans } = req.body || {};

    if (!fy)
      return res.status(400).json({ ok: false, message: "fy is required" });
    if (!database)
      return res
        .status(400)
        .json({ ok: false, message: "database is required" });

    const update = {
      yearPlan: yearPlan || {},
      monthPlans: monthPlans || {},
      updated_by: req.user?._id,
    };

    const doc = await CompanySalesTarget.findOneAndUpdate(
      { database, fy },
      { $set: update, $setOnInsert: { created_by: req.user?._id } },
      { upsert: true, new: true },
    ).lean();

    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error("upsertCompanySalesTarget error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
