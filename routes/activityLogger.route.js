// File: routes/activityLog.routes.js (or similar)
import express from "express";
import ActivityLog from "../model/ActivityLog.js";

const router = express.Router();

/**
 * GET /activity-logs/list
 * Always returns latest logs (up to 2000), no server-side filtering.
 * Frontend will apply date + search filters on its own.
 */
const listHandler = async (req, res) => {
  try {
    // Always fetch all logs (capped)
    const logs = await ActivityLog.find({})
      .sort({ loginAt: -1 })
      .limit(2000)
      .lean();

    const withDerived = logs.map((l) => {
      const durationMs = Math.max(
        0,
        new Date(l.logoutAt || Date.now()) - new Date(l.loginAt || Date.now())
      );

      const hour = l.loginAt ? new Date(l.loginAt).getHours() : 12;

      let risk = 0;
      if (hour < 6 || hour > 22) risk += 1;
      if (!l.email && !l.userId) risk += 1;

      return { ...l, durationMs, risk };
    });

    return res.status(200).json({ status: true, logs: withDerived });
  } catch (e) {
    console.error("GET /activity-logs/list error:", e);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch logs" });
  }
};

// ✅ support both: /activity-logs/list  and  /activity-logs/list/:id (ignored)
router.get("/list", listHandler);
router.get("/list/:_ignored", listHandler);

export default router;
