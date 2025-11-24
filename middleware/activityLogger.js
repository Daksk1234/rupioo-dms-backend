import ActivityLog from "../model/ActivityLog.js";

const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes idle window

const parseDevice = (ua = "") => {
  const s = String(ua || "");
  let os = "";
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(s)) os = "iOS";
  else if (/Linux/i.test(s)) os = "Linux";

  let device = "";
  if (/Mobile|iPhone|Android/i.test(s)) device = "Mobile";
  else if (/iPad/i.test(s)) device = "Tablet";
  else device = "Desktop";

  return `${device}${os ? ` / ${os}` : ""}`;
};

const getClientIp = (req) => {
  const xf = req.headers["x-forwarded-for"];
  if (xf) {
    const parts = String(xf)
      .split(",")
      .map((x) => x.trim());
    if (parts.length) return parts[0];
  }
  return req.ip || req.connection?.remoteAddress || "";
};

export default function activityLogger() {
  return async function logger(req, res, next) {
    try {
      // Don't log activity-log endpoints themselves
      if (req.path.startsWith("/activity-logs")) {
        return next();
      }

      const now = new Date();
      const ip = getClientIp(req);
      const ua = req.headers["user-agent"] || "";
      const device = parseDevice(ua);

      // Prefer values from auth; else from custom headers; else blank
      const user = req.user || {}; // if you attach user in your auth middleware
      const userId = user?._id || req.headers["x-user-id"] || null;
      const name =
        user?.fullName || user?.name || req.headers["x-user-name"] || "";
      const email = user?.email || req.headers["x-user-email"] || "";

      // Optional client-provided geodata (you can also do server IP-to-geo if you want)
      const latitude = req.headers["x-geo-lat"]
        ? Number(req.headers["x-geo-lat"])
        : null;
      const longitude = req.headers["x-geo-lng"]
        ? Number(req.headers["x-geo-lng"])
        : null;
      const city = req.headers["x-geo-city"] || "";
      const state = req.headers["x-geo-state"] || "";

      // Find "open" session for this identity in the last 30 minutes
      const since = new Date(Date.now() - SESSION_IDLE_MS);
      const findQuery = {
        ip,
        ua,
        // match same user if known, else same email/name if provided
        ...(userId ? { userId } : email ? { email } : name ? { name } : {}),
        logoutAt: { $gte: since },
      };

      let session = await ActivityLog.findOne(findQuery)
        .sort({ logoutAt: -1 })
        .exec();

      // Create new session if none
      if (!session) {
        session = new ActivityLog({
          userId: userId || null,
          name,
          email,
          ip,
          latitude,
          longitude,
          city,
          state,
          ua,
          device,
          loginAt: now,
          logoutAt: now,
          hitCount: 1,
          methodLast: req.method,
          pathLast: req.path,
          statusLast: 0,
        });
        await session.save();
      }

      // Update session at response finish
      res.on("finish", async () => {
        try {
          const status = res.statusCode || 0;
          const updates = {
            logoutAt: new Date(),
            methodLast: req.method,
            pathLast: req.path,
            statusLast: status,
          };
          // Keep latest geo if provided
          if (latitude != null) updates.latitude = latitude;
          if (longitude != null) updates.longitude = longitude;
          if (city) updates.city = city;
          if (state) updates.state = state;
          // Optional: refresh identity if known later
          if (userId && !session.userId) updates.userId = userId;
          if (email && !session.email) updates.email = email;
          if (name && !session.name) updates.name = name;

          await ActivityLog.updateOne(
            { _id: session._id },
            { $inc: { hitCount: 1 }, $set: updates }
          ).exec();
        } catch (e) {
          // silent
        }
      });

      next();
    } catch (e) {
      next(); // never block request flow because of logger
    }
  };
}
