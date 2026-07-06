// File: controllers/expense.controller.js

import Expense from "../model/expense.model.js";

function sendSuccess(res, data = {}, message = "Success") {
  return res.status(200).json({
    success: true,
    message,
    ...data,
  });
}

const todayDate = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

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

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function countDays(fromDate, toDate) {
  const start = parseDateOnly(fromDate);
  const end = parseDateOnly(toDate);

  if (!start || !end) return 1;

  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  return Math.max(diff, 1);
}

function normalizeExpensePhotos(value) {
  if (!value) return [];

  const rows = Array.isArray(value) ? value : [value];

  return rows
    .map((photo) => {
      if (!photo) return null;

      if (typeof photo === "string") {
        return {
          fileName: "",
          uri: photo,
          url: photo,
          base64: photo.startsWith("data:image") ? photo : "",
          mimeType: "",
          source: "",
          width: 0,
          height: 0,
          uploadedAt: new Date(),
        };
      }

      const url = safeText(
        photo.url || photo.path || photo.fileUrl || photo.uri,
      );
      const base64 = safeText(photo.base64 || photo.dataUri);

      return {
        fileName: safeText(photo.fileName || photo.filename || photo.name),
        uri: safeText(photo.uri),
        url: url || base64,
        base64,
        mimeType: safeText(photo.mimeType || photo.type),
        source: safeText(photo.source),
        width: safeNumber(photo.width, 0),
        height: safeNumber(photo.height, 0),
        uploadedAt: photo.uploadedAt ? new Date(photo.uploadedAt) : new Date(),
      };
    })
    .filter((photo) => photo && (photo.url || photo.uri || photo.base64));
}

function normalizeExpensePayload(body = {}) {
  const userId = safeText(body.userId || body.employeeId);
  const employeeId = safeText(body.employeeId || body.userId);
  const expenseDate = toDateOnly(
    body.expenseDate ||
      body.expense_date ||
      body.date ||
      body.durationFrom ||
      body.fromDate,
  );
  const durationFrom = expenseDate;
  const durationTo = expenseDate;
  const requestedAmount = safeNumber(body.requestedAmount || body.amount, 0);

  return {
    userId,
    employeeId,
    faceId: safeText(body.faceId),

    userName: safeText(body.userName || body.name || body.nameSnapshot),
    panNumber: safeText(body.panNumber || body.Pan_No || body.pan),
    mobileNumber: safeText(body.mobileNumber || body.mobile || body.Mobile),

    requestedAmount,

    natureOfExpense: safeText(body.natureOfExpense),
    categoryOfExpense: safeText(body.categoryOfExpense),
    detailsOfExpense: safeText(body.detailsOfExpense || body.details),

    invoiceNumber: safeText(body.invoiceNumber),
    partyName: safeText(body.partyName),
    partyContact: safeText(body.partyContact),

    expenseDate,
    durationFrom,
    durationTo,
    totalDays: 1,

    expensePhotos: normalizeExpensePhotos(
      body.expensePhotos ||
        body.photos ||
        body.photoAttachments ||
        body.attachments ||
        body.expensePhoto ||
        body.photoUri,
    ),
  };
}

function validateExpensePayload(payload) {
  if (!payload.userId) return "User is required.";
  if (!payload.requestedAmount || payload.requestedAmount <= 0) {
    return "Amount must be greater than 0.";
  }
  if (!payload.natureOfExpense) return "Nature of expense is required.";
  if (!payload.categoryOfExpense) return "Category of expense is required.";
  if (!payload.detailsOfExpense) return "Details of expense is required.";
  if (!payload.expenseDate) return "Expense date is required.";
  return "";
}

/**
 * Ledger integration placeholder.
 * Do not post to ledger now.
 * Later, when you give the ledger page/API, add actual ledger posting here.
 */
export async function prepareApprovedExpenseLedgerTransfer(expense) {
  const ledgerPayload = {
    type: "Expense",
    source: "ExpenseManagement",
    expenseId: String(expense?._id || ""),
    database: expense?.database || "",
    userId: expense?.userId || "",
    employeeId: expense?.employeeId || expense?.userId || "",
    userName: expense?.userName || "",
    amount: Number(expense?.approvedAmount || 0),
    date: new Date().toISOString(),
    narration: `Approved expense: ${expense?.natureOfExpense || ""} / ${
      expense?.categoryOfExpense || ""
    }`,
    invoiceNumber: expense?.invoiceNumber || "",
    partyName: expense?.partyName || "",
    partyContact: expense?.partyContact || "",
    photoCount: Array.isArray(expense?.expensePhotos)
      ? expense.expensePhotos.length
      : 0,
  };

  return {
    ledgerTransferStatus: "Ready",
    ledgerTransferMessage:
      "Ledger transfer is prepared but not posted. Ledger API integration pending.",
    ledgerPayload,
  };
}

export const createExpenseRequest = async (req, res) => {
  try {
    const database = safeText(req.params.db || req.body.database);

    if (!database) {
      return sendError(res, new Error("Database is required."), 400);
    }

    const payload = normalizeExpensePayload(req.body);
    const error = validateExpensePayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const expense = await Expense.create({
      database,
      ...payload,
      status: "Requested",
      paymentStatus: "Unpaid",
      paymentRemark: "",
      paidBy: "",
      paidByName: "",
      paidAt: null,
      paidOn: "",
      approvedAmount: 0,
      rejectionReason: "",
      superAdminRemark: "",
      ledgerTransferStatus: "Not Ready",
      ledgerTransferMessage: "",
      ledgerPayload: null,
      createdBy: safeText(req.body.createdBy || req.body.requestedBy),
      createdByName: safeText(
        req.body.createdByName || req.body.requestedByName,
      ),
      updatedBy: safeText(req.body.createdBy || req.body.requestedBy),
    });

    return sendSuccess(
      res,
      { expense },
      "Expense request created successfully.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const getExpenses = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const status = safeText(req.query.status || "All");
    const userId = safeText(req.query.userId);
    const search = safeText(req.query.search).toLowerCase();

    const filter = {
      database,
      status: { $ne: "Deleted" },
    };

    if (status && status !== "All") {
      filter.status = status;
    }

    if (userId) {
      filter.$or = [{ userId }, { employeeId: userId }];
    }

    let expenses = await Expense.find(filter).sort({
      createdAt: -1,
    });

    if (search) {
      expenses = expenses.filter((x) => {
        const text =
          `${x.userName} ${x.panNumber} ${x.mobileNumber} ${x.requestedAmount} ${x.approvedAmount} ${x.natureOfExpense} ${x.categoryOfExpense} ${x.detailsOfExpense} ${x.invoiceNumber} ${x.partyName} ${x.partyContact} ${x.status} ${x.paymentStatus} ${x.paymentRemark} ${x.rejectionReason}`.toLowerCase();
        return text.includes(search);
      });
    }

    return sendSuccess(res, { expenses }, "Expenses fetched.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const getRequestedExpenses = async (req, res) => {
  try {
    req.query.status = "Requested";
    return getExpenses(req, res);
  } catch (error) {
    return sendError(res, error);
  }
};

export const approveExpense = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const approvedAmount = safeNumber(req.body.approvedAmount, -1);

    if (approvedAmount < 0) {
      return sendError(res, new Error("Approved amount is required."), 400);
    }

    const expense = await Expense.findOne({
      _id: id,
      database,
      status: { $in: ["Requested", "Rejected"] },
    });

    if (!expense) {
      return sendError(res, new Error("Expense request not found."), 404);
    }

    if (approvedAmount > Number(expense.requestedAmount || 0)) {
      return sendError(
        res,
        new Error("Approved amount cannot be greater than requested amount."),
        400,
      );
    }

    expense.status = "Approved";
    // Approval should never mark payment as paid.
    expense.paymentStatus = "Unpaid";
    expense.paymentRemark = "";
    expense.paidBy = "";
    expense.paidByName = "";
    expense.paidAt = null;
    expense.paidOn = "";
    expense.approvedAmount = approvedAmount;
    expense.superAdminRemark = safeText(
      req.body.superAdminRemark || req.body.remark,
    );
    expense.rejectionReason = "";
    expense.approvedBy = safeText(req.body.approvedBy || req.body.actionBy);
    expense.approvedByName = safeText(
      req.body.approvedByName || req.body.actionByName,
    );
    expense.approvedAt = new Date();
    expense.rejectedBy = "";
    expense.rejectedByName = "";
    expense.rejectedAt = null;
    expense.updatedBy = safeText(req.body.approvedBy || req.body.actionBy);

    const ledgerData = await prepareApprovedExpenseLedgerTransfer(expense);

    expense.ledgerTransferStatus = ledgerData.ledgerTransferStatus;
    expense.ledgerTransferMessage = ledgerData.ledgerTransferMessage;
    expense.ledgerPayload = ledgerData.ledgerPayload;

    await expense.save();

    return sendSuccess(
      res,
      { expense },
      "Expense approved. Ledger transfer is prepared but not posted yet.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const rejectExpense = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;
    const rejectionReason = safeText(
      req.body.rejectionReason || req.body.reason,
    );

    if (!rejectionReason) {
      return sendError(res, new Error("Reject reason is required."), 400);
    }

    const expense = await Expense.findOne({
      _id: id,
      database,
      status: { $in: ["Requested", "Rejected"] },
    });

    if (!expense) {
      return sendError(res, new Error("Expense request not found."), 404);
    }

    expense.status = "Rejected";
    expense.paymentStatus = "Unpaid";
    expense.paymentRemark = "";
    expense.paidBy = "";
    expense.paidByName = "";
    expense.paidAt = null;
    expense.paidOn = "";
    expense.approvedAmount = 0;
    expense.rejectionReason = rejectionReason;
    expense.superAdminRemark = safeText(
      req.body.superAdminRemark || req.body.remark,
    );
    expense.rejectedBy = safeText(req.body.rejectedBy || req.body.actionBy);
    expense.rejectedByName = safeText(
      req.body.rejectedByName || req.body.actionByName,
    );
    expense.rejectedAt = new Date();
    expense.approvedBy = "";
    expense.approvedByName = "";
    expense.approvedAt = null;
    expense.ledgerTransferStatus = "Not Ready";
    expense.ledgerTransferMessage = "";
    expense.ledgerPayload = null;
    expense.updatedBy = safeText(req.body.rejectedBy || req.body.actionBy);

    await expense.save();

    return sendSuccess(res, { expense }, "Expense rejected successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateExpense = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const payload = normalizeExpensePayload(req.body);
    const error = validateExpensePayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const expense = await Expense.findOne({
      _id: id,
      database,
      status: { $in: ["Requested", "Rejected"] },
    });

    if (!expense) {
      return sendError(
        res,
        new Error("Only requested or rejected expenses can be corrected."),
        404,
      );
    }

    Object.assign(expense, payload);

    expense.updatedBy = safeText(req.body.updatedBy);
    expense.correctedCount = Number(expense.correctedCount || 0) + 1;
    expense.correctionHistory.push({
      correctedBy: safeText(req.body.updatedBy),
      correctedByName: safeText(req.body.updatedByName),
      note: safeText(req.body.correctionNote || "Expense corrected."),
    });

    await expense.save();

    return sendSuccess(res, { expense }, "Expense updated successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};

export const resubmitExpense = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const payload = normalizeExpensePayload(req.body);
    const error = validateExpensePayload(payload);

    if (error) {
      return sendError(res, new Error(error), 400);
    }

    const expense = await Expense.findOne({
      _id: id,
      database,
      status: "Rejected",
    });

    if (!expense) {
      return sendError(res, new Error("Rejected expense not found."), 404);
    }

    Object.assign(expense, payload);

    expense.status = "Requested";
    expense.paymentStatus = "Unpaid";
    expense.paymentRemark = "";
    expense.paidBy = "";
    expense.paidByName = "";
    expense.paidAt = null;
    expense.paidOn = "";
    expense.approvedAmount = 0;
    expense.rejectionReason = "";
    expense.superAdminRemark = "";
    expense.approvedBy = "";
    expense.approvedByName = "";
    expense.approvedAt = null;
    expense.rejectedBy = "";
    expense.rejectedByName = "";
    expense.rejectedAt = null;
    expense.ledgerTransferStatus = "Not Ready";
    expense.ledgerTransferMessage = "";
    expense.ledgerPayload = null;
    expense.updatedBy = safeText(req.body.updatedBy);
    expense.correctedCount = Number(expense.correctedCount || 0) + 1;
    expense.correctionHistory.push({
      correctedBy: safeText(req.body.updatedBy),
      correctedByName: safeText(req.body.updatedByName),
      note: safeText(req.body.correctionNote || "Corrected and resubmitted."),
    });

    await expense.save();

    return sendSuccess(
      res,
      { expense },
      "Expense corrected and resubmitted successfully.",
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const payExpense = async (req, res) => {
  try {
    const { id, db } = req.params;

    const row = await Expense.findOneAndUpdate(
      {
        _id: id,
        database: db,
        status: "Approved",
      },
      {
        $set: {
          paymentStatus: "Paid",
          paymentRemark: req.body.paymentRemark || req.body.paidRemark || "",
          paidRemark: req.body.paidRemark || req.body.paymentRemark || "",
          paidBy: req.body.paidBy || req.body.actionBy || null,
          paidByName: req.body.paidByName || req.body.actionByName || "",
          paidOn: todayDate(),
          paidAt: new Date().toISOString(),
          updatedBy: req.body.actionBy || req.body.paidBy || null,
          updatedByName: req.body.actionByName || req.body.paidByName || "",
        },
      },
      { new: true },
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Approved expense not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Expense marked as paid.",
      expense: row,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to mark expense as paid.",
      error: error.message,
    });
  }
};

export const markExpensePaid = payExpense;

export const deleteExpense = async (req, res) => {
  try {
    const database = safeText(req.params.db);
    const id = req.params.id;

    const expense = await Expense.findOneAndUpdate(
      {
        _id: id,
        database,
        status: { $ne: "Deleted" },
      },
      {
        $set: {
          status: "Deleted",
          updatedBy: safeText(req.body.updatedBy),
        },
      },
      { new: true },
    );

    if (!expense) {
      return sendError(res, new Error("Expense not found."), 404);
    }

    return sendSuccess(res, { expense }, "Expense deleted successfully.");
  } catch (error) {
    return sendError(res, error);
  }
};
