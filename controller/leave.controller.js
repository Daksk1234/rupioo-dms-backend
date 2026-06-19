// File: controllers/leave.controller.js

import LeaveRequest from "../model/leaveRequest.model.js";
import Leave from "../model/leave.model.js";

function sendSuccess(res, data = {}, message = "Success") {
  return res.status(200).json({
    success: true,
    message,
    ...data,
  });
}

function sendError(res, error, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    message: error?.message || "Something went wrong",
  });
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function toDateOnly(value) {
  const text = safeText(value);
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(value) {
  const text = toDateOnly(value);
  if (!text) return null;

  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function countLeaveDays(fromDate, toDate) {
  const start = parseDateOnly(fromDate);
  const end = parseDateOnly(toDate);

  if (!start || !end) return 1;

  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  return Math.max(diff, 1);
}

function normalizeApprovalChain(chain = []) {
  const seen = new Set();

  return (Array.isArray(chain) ? chain : [])
    .map((x, index) => {
      const approverId = safeText(x.approverId || x.userId || x._id);
      if (!approverId) return null;
      if (seen.has(approverId)) return null;

      seen.add(approverId);

      return {
        level: Number(x.level || index + 1),
        approverId,
        approverName: safeText(x.approverName || x.name || x.userName),
        roleName: safeText(x.roleName),
        isSuperAdmin: !!x.isSuperAdmin,
        status: "Pending",
        remark: "",
        actionAt: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0));
}

function normalizeLeaveRequestPayload(body = {}) {
  const userId = safeText(body.userId || body.employeeId);
  const employeeId = safeText(body.employeeId || body.userId);
  const fromDate = toDateOnly(body.fromDate || body.date);
  const toDate = toDateOnly(body.toDate || body.fromDate || body.date);
  const totalDays = Number(body.totalDays || countLeaveDays(fromDate, toDate));

  return {
    userId,
    employeeId,
    faceId: safeText(body.faceId),
    userName: safeText(body.userName || body.name || body.nameSnapshot),
    panNumber: safeText(body.panNumber || body.Pan_No || body.pan),
    mobileNumber: safeText(body.mobileNumber || body.mobile || body.Mobile),
    fromDate,
    toDate,
    totalDays: Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 1,
    reason: safeText(body.reason),
    approvalChain: normalizeApprovalChain(body.approvalChain),
  };
}

function validateLeaveRequestPayload(payload) {
  if (!payload.userId) return "User is required.";
  if (!payload.fromDate) return "From date is required.";
  if (!payload.toDate) return "To date is required.";
  if (payload.toDate < payload.fromDate) {
    return "To date cannot be before from date.";
  }
  if (!payload.reason) return "Reason is required.";
  if (!payload.approvalChain.length) return "Approval hierarchy is required.";
  return "";
}

function normalizeDirectLeavePayload(body = {}) {
  const userId = safeText(body.userId || body.employeeId);
  const employeeId = safeText(body.employeeId || body.userId);
  const fromDate = toDateOnly(body.fromDate || body.date);
  const toDate = toDateOnly(body.toDate || body.fromDate || body.date);
  const totalDays = Number(body.totalDays || countLeaveDays(fromDate, toDate));

  return {
    userId,
    employeeId,
    faceId: safeText(body.faceId),
    userName: safeText(body.userName || body.name || body.nameSnapshot),
    panNumber: safeText(body.panNumber || body.Pan_No || body.pan),
    mobileNumber: safeText(body.mobileNumber || body.mobile || body.Mobile),
    fromDate,
    toDate,
    totalDays: Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 1,
    reason: safeText(body.reason),
  };
}

function validateDirectLeavePayload(payload) {
  if (!payload.userId) return "User is required.";
  if (!payload.fromDate) return "From date is required.";
  if (!payload.toDate) return "To date is required.";
  if (payload.toDate < payload.fromDate) {
    return "To date cannot be before from date.";
  }
  if (!payload.reason) return "Reason is required.";
  return "";
}

function firstPendingApprover(chain = []) {
  return chain.find((x) => x.status === "Pending") || null;
}

function getApproverIndex(request, approverId) {
  const currentApproverId = safeText(request.currentApproverId);

  return (request.approvalChain || []).findIndex((x) => {
    if (x.status !== "Pending") return false;
    if (!sameId(x.approverId, approverId)) return false;
    if (currentApproverId && !sameId(currentApproverId, approverId)) {
      return false;
    }
    return true;
  });
}

function isSuperAdminForRequest(request, approverId, superAdminId = "") {
  if (!approverId) return false;

  if (superAdminId && sameId(approverId, superAdminId)) return true;

  return (request.approvalChain || []).some(
    (x) => sameId(x.approverId, approverId) && x.isSuperAdmin,
  );
}

async function createFinalLeaveFromRequest({
  request,
  status,
  finalActionBy,
  finalActionByName,
  finalRemark,
  leavePayType,
  salaryDeductible,
}) {
  const leave = await Leave.create({
    database: request.database,
    leaveRequestId: request._id,
    source: "Request",

    userId: request.userId,
    employeeId: request.employeeId || request.userId,
    faceId: request.faceId || "",

    userName: request.userName,
    panNumber: request.panNumber,
    mobileNumber: request.mobileNumber,

    fromDate: request.fromDate,
    toDate: request.toDate,
    totalDays: request.totalDays,
    reason: request.reason,

    status,
    approvalChain: request.approvalChain || [],

    finalActionBy,
    finalActionByName,
    finalActionAt: new Date(),
    finalRemark,

    leavePayType: status === "Accepted" ? leavePayType : "",
    salaryDeductible: status === "Accepted" ? !!salaryDeductible : false,

    createdBy: request.requestedBy,
    updatedBy: finalActionBy,
  });

  request.status = status;
  request.currentApproverId = "";
  request.currentApproverName = "";
  request.finalActionBy = finalActionBy;
  request.finalActionByName = finalActionByName;
  request.finalActionAt = new Date();
  request.finalRemark = finalRemark;
  request.leavePayType = status === "Accepted" ? leavePayType : "";
  request.salaryDeductible = status === "Accepted" ? !!salaryDeductible : false;
  request.linkedLeaveId = leave._id;

  await request.save();

  return leave;
}

export const createLeaveRequest = async (req, res) => {
  try {
    const database = safeText(req.params.db || req.body.database);

    if (!database) {
      return sendError(res, new Error("Database is required."), 400);
    }

    const payload = normalizeLeaveRequestPayload(req.body);
    const error = validateLeaveRequestPayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const firstApprover = firstPendingApprover(payload.approvalChain);

    const request = await LeaveRequest.create({
      database,
      ...payload,
      status: "Pending",
      currentApproverId: firstApprover?.approverId || "",
      currentApproverName: firstApprover?.approverName || "",
      currentLevel: firstApprover?.level || 1,
      requestedBy: safeText(req.body.requestedBy || req.body.createdBy),
      requestedByName: safeText(
        req.body.requestedByName || req.body.createdByName,
      ),
    });

    return sendSuccess(
      res,
      { request },
      "Leave request forwarded for approval.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const getLeaveRequests = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const status = safeText(req.query.status || "Pending");
    const userId = safeText(req.query.userId);
    const currentApproverId = safeText(req.query.currentApproverId);

    const filter = { database };

    if (status && status !== "All") {
      filter.status = status;
    } else {
      filter.status = { $ne: "Deleted" };
    }

    if (userId) {
      filter.$or = [
        { userId },
        { employeeId: userId },
        { requestedBy: userId },
        { "approvalChain.approverId": userId },
      ];
    }

    if (currentApproverId) {
      filter.currentApproverId = currentApproverId;
    }

    const requests = await LeaveRequest.find(filter).sort({
      createdAt: -1,
    });

    return sendSuccess(res, { requests }, "Leave requests fetched.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const approveLeaveRequest = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const approverId = safeText(req.body.approverId || req.body.actionBy);
    const approverName = safeText(
      req.body.approverName || req.body.actionByName,
    );
    const remark = safeText(req.body.remark || req.body.actionRemark);

    if (!approverId) {
      return sendError(res, new Error("Approver id is required."), 400);
    }

    const request = await LeaveRequest.findOne({
      _id: id,
      database,
      status: "Pending",
    });

    if (!request) {
      return sendError(res, new Error("Pending leave request not found."), 404);
    }

    const idx = getApproverIndex(request, approverId);

    if (idx < 0) {
      return sendError(
        res,
        new Error("This leave is not pending for your approval."),
        403,
      );
    }

    request.approvalChain[idx].status = "Accepted";
    request.approvalChain[idx].remark = remark;
    request.approvalChain[idx].actionAt = new Date();

    const next = request.approvalChain.find((x) => x.status === "Pending");

    if (next) {
      request.currentApproverId = next.approverId;
      request.currentApproverName = next.approverName;
      request.currentLevel = next.level;

      await request.save();

      return sendSuccess(
        res,
        { request, completed: false },
        "Leave accepted and forwarded to next senior.",
      );
    }

    const leavePayType =
      req.body.leavePayType === "Paid" || req.body.leavePayType === "Free"
        ? req.body.leavePayType
        : "Free";

    const salaryDeductible =
      leavePayType === "Paid" || req.body.salaryDeductible === true;

    const leave = await createFinalLeaveFromRequest({
      request,
      status: "Accepted",
      finalActionBy: approverId,
      finalActionByName: approverName,
      finalRemark: remark,
      leavePayType,
      salaryDeductible,
    });

    return sendSuccess(
      res,
      { request, leave, completed: true },
      "Leave finally accepted.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const superApproveLeaveRequest = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const approverId = safeText(req.body.approverId || req.body.actionBy);
    const approverName = safeText(
      req.body.approverName || req.body.actionByName || "Super Admin",
    );
    const superAdminId = safeText(req.body.superAdminId);
    const remark =
      safeText(req.body.remark || req.body.actionRemark) ||
      "Approved directly by Super Admin.";

    const leavePayType =
      req.body.leavePayType === "Paid" || req.body.leavePayType === "Free"
        ? req.body.leavePayType
        : "";

    if (!approverId) {
      return sendError(res, new Error("Super Admin id is required."), 400);
    }

    if (!leavePayType) {
      return sendError(
        res,
        new Error("Please select Paid or Free before approval."),
        400,
      );
    }

    const request = await LeaveRequest.findOne({
      _id: id,
      database,
      status: "Pending",
    });

    if (!request) {
      return sendError(res, new Error("Pending leave request not found."), 404);
    }

    if (!isSuperAdminForRequest(request, approverId, superAdminId)) {
      return sendError(
        res,
        new Error("Only Super Admin can use direct approval."),
        403,
      );
    }

    const now = new Date();

    request.approvalChain = (request.approvalChain || []).map((step) => {
      const isCurrentSuper = sameId(step.approverId, approverId);

      return {
        ...step,
        status: "Accepted",
        remark: isCurrentSuper
          ? remark
          : step.remark || "Approved by Super Admin direct approval.",
        actionAt: step.actionAt || now,
      };
    });

    if (
      !(request.approvalChain || []).some((x) =>
        sameId(x.approverId, approverId),
      )
    ) {
      request.approvalChain.push({
        level: (request.approvalChain || []).length + 1,
        approverId,
        approverName,
        roleName: "Super Admin",
        isSuperAdmin: true,
        status: "Accepted",
        remark,
        actionAt: now,
      });
    }

    const salaryDeductible =
      leavePayType === "Paid" || req.body.salaryDeductible === true;

    const leave = await createFinalLeaveFromRequest({
      request,
      status: "Accepted",
      finalActionBy: approverId,
      finalActionByName: approverName,
      finalRemark: remark,
      leavePayType,
      salaryDeductible,
    });

    return sendSuccess(
      res,
      {
        request,
        leave,
        completed: true,
        superApproved: true,
      },
      "Leave directly approved by Super Admin.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const rejectLeaveRequest = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const approverId = safeText(req.body.approverId || req.body.actionBy);
    const approverName = safeText(
      req.body.approverName || req.body.actionByName,
    );
    const remark = safeText(req.body.remark || req.body.actionRemark);

    if (!approverId) {
      return sendError(res, new Error("Approver id is required."), 400);
    }

    if (!remark) {
      return sendError(res, new Error("Reject reason is required."), 400);
    }

    const request = await LeaveRequest.findOne({
      _id: id,
      database,
      status: "Pending",
    });

    if (!request) {
      return sendError(res, new Error("Pending leave request not found."), 404);
    }

    const idx = getApproverIndex(request, approverId);

    if (idx < 0) {
      return sendError(
        res,
        new Error("This leave is not pending for your rejection."),
        403,
      );
    }

    request.approvalChain[idx].status = "Rejected";
    request.approvalChain[idx].remark = remark;
    request.approvalChain[idx].actionAt = new Date();

    for (let i = idx + 1; i < request.approvalChain.length; i += 1) {
      if (request.approvalChain[i].status === "Pending") {
        request.approvalChain[i].status = "Skipped";
      }
    }

    const leave = await createFinalLeaveFromRequest({
      request,
      status: "Rejected",
      finalActionBy: approverId,
      finalActionByName: approverName,
      finalRemark: remark,
      leavePayType: "",
      salaryDeductible: false,
    });

    return sendSuccess(
      res,
      { request, leave, completed: true },
      "Leave rejected.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const createLeave = async (req, res) => {
  try {
    const database = safeText(req.params.db || req.body.database);

    if (!database) {
      return sendError(res, new Error("Database is required."), 400);
    }

    const payload = normalizeDirectLeavePayload(req.body);
    const error = validateDirectLeavePayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const status = ["Accepted", "Rejected"].includes(req.body.status)
      ? req.body.status
      : "Accepted";

    const leavePayType =
      req.body.leavePayType === "Paid" || req.body.leavePayType === "Free"
        ? req.body.leavePayType
        : status === "Accepted"
          ? "Free"
          : "";

    const salaryDeductible =
      status === "Accepted" &&
      (leavePayType === "Paid" || req.body.salaryDeductible === true);

    const leave = await Leave.create({
      database,
      ...payload,
      status,
      source: "Admin",
      approvalChain: Array.isArray(req.body.approvalChain)
        ? req.body.approvalChain
        : [],
      finalActionBy: safeText(req.body.createdBy || req.body.updatedBy),
      finalActionByName: safeText(
        req.body.createdByName || req.body.updatedByName,
      ),
      finalActionAt: new Date(),
      finalRemark: safeText(req.body.finalRemark || req.body.remark),
      leavePayType,
      salaryDeductible,
      createdBy: safeText(req.body.createdBy),
      updatedBy: safeText(req.body.updatedBy || req.body.createdBy),
    });

    return sendSuccess(res, { leave }, "Leave created successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const getLeaves = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const statusQuery = safeText(req.query.status || "All");
    const userId = safeText(req.query.userId);
    const search = safeText(req.query.search).toLowerCase();

    const filter = {
      database,
      status: { $in: ["Accepted", "Rejected", "Cancelled"] },
    };

    if (statusQuery !== "All" && statusQuery) {
      filter.status = statusQuery;
    }

    if (userId) {
      filter.$or = [{ userId }, { employeeId: userId }];
    }

    let leaves = await Leave.find(filter).sort({
      createdAt: -1,
      fromDate: -1,
    });

    if (search) {
      leaves = leaves.filter((x) => {
        const text =
          `${x.userName} ${x.panNumber} ${x.mobileNumber} ${x.reason} ${x.status} ${x.fromDate} ${x.toDate}`.toLowerCase();
        return text.includes(search);
      });
    }

    return sendSuccess(res, { leaves }, "Leaves fetched.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateLeave = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const payload = normalizeDirectLeavePayload(req.body);
    const error = validateDirectLeavePayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const update = {
      ...payload,
      updatedBy: safeText(req.body.updatedBy),
    };

    if (["Accepted", "Rejected", "Cancelled"].includes(req.body.status)) {
      update.status = req.body.status;
    }

    if (req.body.leavePayType === "Paid" || req.body.leavePayType === "Free") {
      update.leavePayType = req.body.leavePayType;
      update.salaryDeductible =
        req.body.leavePayType === "Paid" || req.body.salaryDeductible === true;
    }

    const leave = await Leave.findOneAndUpdate(
      {
        _id: id,
        database,
        status: { $ne: "Deleted" },
      },
      { $set: update },
      { new: true },
    );

    if (!leave) {
      return sendError(res, new Error("Leave not found."), 404);
    }

    return sendSuccess(res, { leave }, "Leave updated successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const deleteLeave = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const leave = await Leave.findOneAndDelete({
      _id: id,
      database,
    });

    if (!leave) {
      return sendError(res, new Error("Leave not found."), 404);
    }

    return sendSuccess(res, { leave }, "Leave deleted successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const getActiveLeaveForAttendance = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const userKey = safeText(req.params.userId);
    const date = toDateOnly(req.query.date || new Date());

    if (!database || !userKey) {
      return sendError(
        res,
        new Error("Database and user id are required."),
        400,
      );
    }

    const leave = await Leave.findOne({
      database,
      status: "Accepted",
      fromDate: { $lte: date },
      toDate: { $gte: date },
      $or: [{ userId: userKey }, { employeeId: userKey }],
    }).sort({ createdAt: -1 });

    return sendSuccess(
      res,
      {
        active: !!leave,
        leave,
      },
      leave ? "Active leave found." : "No active leave.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const cancelActiveLeaveForAttendance = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const userKey = safeText(req.params.userId);
    const date = toDateOnly(req.body.date || req.query.date || new Date());

    if (!database || !userKey) {
      return sendError(
        res,
        new Error("Database and user id are required."),
        400,
      );
    }

    const leaves = await Leave.find({
      database,
      status: "Accepted",
      fromDate: { $lte: date },
      toDate: { $gte: date },
      $or: [{ userId: userKey }, { employeeId: userKey }],
    });

    if (!leaves.length) {
      return sendSuccess(
        res,
        {
          cancelledCount: 0,
          leaves: [],
        },
        "No active leave found to cancel.",
      );
    }

    const ids = leaves.map((x) => x._id);

    await Leave.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "Cancelled",
          source: "Attendance",
          cancelledByAttendance: true,
          cancellationReason:
            safeText(req.body.reason) ||
            "Employee marked attendance during approved leave.",
          cancelledAt: new Date(),
          updatedBy: safeText(req.body.updatedBy || userKey),
        },
      },
    );

    await LeaveRequest.updateMany(
      { linkedLeaveId: { $in: ids } },
      {
        $set: {
          status: "Cancelled",
          finalRemark:
            safeText(req.body.reason) ||
            "Employee marked attendance during approved leave.",
          finalActionAt: new Date(),
        },
      },
    );

    const updatedLeaves = await Leave.find({
      _id: { $in: ids },
    }).sort({ createdAt: -1 });

    return sendSuccess(
      res,
      {
        cancelledCount: updatedLeaves.length,
        leaves: updatedLeaves,
      },
      "Active leave cancelled. Attendance can continue.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};
