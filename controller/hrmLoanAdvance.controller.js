// File: controller/hrmLoanAdvance.controller.js

import mongoose from "mongoose";
import { HrmLoanAdvance } from "../model/hrmLoanAdvance.model.js";
import { HrmEmployeeLedger } from "../model/hrmEmployeeLedger.model.js";

const success = (res, message, data = null, extra = {}) => {
  return res.status(200).json({
    status: true,
    message,
    data,
    ...extra,
  });
};

const fail = (res, code, message, error = null) => {
  return res.status(code).json({
    status: false,
    message,
    error: error ? String(error?.message || error) : undefined,
  });
};

const cleanDatabase = (value) => {
  const db = String(value || "").trim();

  if (!db) throw new Error("Database is required.");

  if (!/^[a-zA-Z0-9_-]+$/.test(db)) {
    throw new Error("Invalid database name.");
  }

  return db;
};

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));

const toObjectId = (value) => {
  if (!isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const str = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const num = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const bool = (value) => {
  return value === true || value === "true" || value === 1 || value === "1";
};

const todayDate = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const toDateOnly = (value) => {
  const text = str(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthKey = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
};

const addMonths = (date, count) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
};

const money = (value) => {
  const n = num(value);

  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
};

const emiAmount = (principal, annualInterestRate, tenureMonths) => {
  const p = num(principal);
  const n = num(tenureMonths);
  const annualRate = num(annualInterestRate);

  if (!p || !n) return 0;

  const monthlyRate = annualRate / 12 / 100;

  if (!monthlyRate) return p / n;

  const pow = Math.pow(1 + monthlyRate, n);

  return (p * monthlyRate * pow) / (pow - 1);
};

const requestNo = () => {
  const d = new Date();
  const part = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(d.getDate()).padStart(2, "0")}`;

  return `LA-${part}-${String(Date.now()).slice(-5)}`;
};

const normalizeAttachment = (value) => {
  if (!value) return [];

  if (typeof value === "string") {
    return [
      {
        fileName: value,
        url: value,
        mimeType: "",
        size: 0,
      },
    ];
  }

  if (Array.isArray(value)) {
    return value.map((x) => ({
      fileName: str(x.fileName || x.filename || x.name || ""),
      url: str(x.url || x.path || x.fileUrl || ""),
      mimeType: str(x.mimeType || x.type || ""),
      size: num(x.size || x.sizeBytes),
    }));
  }

  if (typeof value === "object") {
    return [
      {
        fileName: str(value.fileName || value.filename || value.name || ""),
        url: str(value.url || value.path || value.fileUrl || ""),
        mimeType: str(value.mimeType || value.type || ""),
        size: num(value.size || value.sizeBytes),
      },
    ];
  }

  return [];
};

const normalizeOutstandingSnapshot = (value) => {
  if (!Array.isArray(value)) return [];

  return value.map((row) => ({
    customerId: str(row.customerId || row._id || row.id || ""),
    customerName: str(
      row.customerName ||
        row.CompanyName ||
        row.companyName ||
        row.name ||
        row.partyName ||
        "Customer",
    ),
    date: str(
      row.date ||
        row.invoiceDate ||
        row.createdAt?.slice?.(0, 10) ||
        todayDate(),
    ),
    invoiceNo: str(row.invoiceNo || row.invoiceId || row.billNo || ""),
    amount: num(
      row.amount ||
        row.outstandingAmount ||
        row.balanceAmount ||
        row.pendingAmount ||
        row.dueAmount ||
        row.balance ||
        0,
    ),
    remarks: str(row.remarks || row.remark || ""),
  }));
};

const buildCalculation = ({
  requestType,
  salary,
  amount,
  interestRate,
  tenureMonths,
  limitPercent,
}) => {
  const salaryAmount = num(salary);
  const principal = num(amount);
  const percent = num(limitPercent || 30);
  const allowedLimitAmount = Number(
    ((salaryAmount * percent) / 100).toFixed(2),
  );

  if (requestType === "Loan") {
    const monthlyEmi = Number(
      emiAmount(principal, interestRate, tenureMonths).toFixed(2),
    );

    const totalPayable = Number((monthlyEmi * num(tenureMonths)).toFixed(2));
    const totalInterest = Number((totalPayable - principal).toFixed(2));

    return {
      monthlyEmi,
      totalPayable,
      totalInterest,
      allowedLimitAmount,
      isWithinLimit: principal <= allowedLimitAmount,
    };
  }

  return {
    monthlyEmi: 0,
    totalPayable: principal,
    totalInterest: 0,
    allowedLimitAmount,
    isWithinLimit: principal <= allowedLimitAmount,
  };
};

const buildEmiSchedule = (row) => {
  const principal = num(row.amount);
  const monthlyEmi = num(row.monthlyEmi);
  const tenure = num(row.tenureMonths);
  const annualRate = num(row.interestRate);
  const monthlyRate = annualRate / 12 / 100;

  let balance = principal;
  const schedule = [];

  for (let i = 1; i <= tenure; i += 1) {
    const dueDate = addMonths(new Date(), i);
    const interestPart = Number((balance * monthlyRate).toFixed(2));
    let principalPart = Number((monthlyEmi - interestPart).toFixed(2));

    if (i === tenure) {
      principalPart = balance;
    }

    balance = Number((balance - principalPart).toFixed(2));
    if (balance < 0) balance = 0;

    schedule.push({
      emiNo: i,
      dueMonth: monthKey(dueDate),
      dueDate: `${monthKey(dueDate)}-01`,
      amount: Number(monthlyEmi.toFixed(2)),
      principalPart: Number(principalPart.toFixed(2)),
      interestPart: Number(interestPart.toFixed(2)),
      remainingBalance: Number(balance.toFixed(2)),
      status: "Pending",
      deductedFromSalary: false,
      deductedAt: "",
      salaryMonth: "",
      ledgerId: null,
    });
  }

  return schedule;
};

const validatePayload = (payload, mode = "create") => {
  if (!payload.employeeId && !payload.employeeIdText) {
    throw new Error("Employee is required.");
  }

  if (!payload.employeeName) {
    throw new Error("Employee name is required.");
  }

  if (!payload.requestType) {
    throw new Error("Request type is required.");
  }

  if (!["Loan", "Advance"].includes(payload.requestType)) {
    throw new Error("Request type must be Loan or Advance.");
  }

  if (!payload.salary) {
    throw new Error("Salary is required.");
  }

  if (!payload.amount) {
    throw new Error("Amount is required.");
  }

  if (!payload.reason && mode === "create") {
    throw new Error("Reason is required.");
  }

  if (payload.requestType === "Loan") {
    if (!payload.tenureMonths) {
      throw new Error("Loan tenure is required.");
    }

    if (payload.amount > payload.allowedLimitAmount) {
      throw new Error(
        `Loan basic amount ${money(payload.amount)} is more than allowed salary limit ${money(
          payload.allowedLimitAmount,
        )}.`,
      );
    }

    if (
      !payload.guardianApprovalAttachment &&
      !payload.guardianApprovalAttachments?.length
    ) {
      throw new Error("Guardian approval attachment is required for loan.");
    }
  }

  if (payload.requestType === "Advance") {
    if (payload.amount > payload.allowedLimitAmount) {
      throw new Error(
        `Advance amount ${money(payload.amount)} is more than allowed salary limit ${money(
          payload.allowedLimitAmount,
        )}.`,
      );
    }
  }

  return true;
};

const RUNNING_LIMIT_STATUSES = ["Approved"];
const IGNORED_LIMIT_STATUSES = ["Deleted"];

const getActiveLimitQuery = (payload = {}, excludeId = "") => {
  const employeeObjectId =
    payload.employeeId || toObjectId(payload.employeeIdText);
  const employeeIdText = str(
    payload.employeeIdText || payload.employeeId || "",
  );

  const or = [
    ...(employeeObjectId ? [{ employeeId: employeeObjectId }] : []),
    ...(employeeIdText ? [{ employeeIdText }] : []),
  ];

  if (!or.length) {
    throw new Error("Employee is required for salary limit check.");
  }

  return {
    database: payload.database,
    status: { $in: RUNNING_LIMIT_STATUSES, $nin: IGNORED_LIMIT_STATUSES },
    ...(excludeId ? { _id: { $ne: toObjectId(excludeId) || excludeId } } : {}),
    $or: or,
  };
};

const getActiveBasicLimitUsage = async ({
  payload,
  excludeId = "",
  session = null,
}) => {
  const query = getActiveLimitQuery(payload, excludeId);

  let request = HrmLoanAdvance.find(query).select(
    "requestNo requestType status amount paidAmount employeeName",
  );

  if (session) request = request.session(session);

  const rows = await request.lean();
  const usedBasicAmount = rows.reduce((sum, row) => {
    const basicAmount = num(row.amount);
    const paidAmount = num(row.paidAmount);

    return sum + Math.max(basicAmount - paidAmount, 0);
  }, 0);

  return {
    rows,
    usedBasicAmount,
    availableBasicAmount: Math.max(
      num(payload.allowedLimitAmount) - usedBasicAmount,
      0,
    ),
    requestedBasicAmount: num(payload.amount),
  };
};

const validateActiveBasicSalaryLimit = async ({
  payload,
  excludeId = "",
  session = null,
} = {}) => {
  const usage = await getActiveBasicLimitUsage({ payload, excludeId, session });
  const totalAfterRequest = usage.usedBasicAmount + usage.requestedBasicAmount;
  const allowedLimitAmount = num(payload.allowedLimitAmount);

  if (totalAfterRequest > allowedLimitAmount) {
    throw new Error(
      `${payload.requestType} basic amount ${money(
        usage.requestedBasicAmount,
      )} cannot be added. Salary limit is ${money(
        allowedLimitAmount,
      )}; already used in approved loan / advance is ${money(
        usage.usedBasicAmount,
      )}; available limit is ${money(
        usage.availableBasicAmount,
      )}. Pay EMI / deduct advance / close the old approved loan or advance before adding more.`,
    );
  }

  return usage;
};

const buildPayload = (body = {}, database, oldRow = null) => {
  const requestType = str(body.requestType || oldRow?.requestType || "Loan");
  const salary = num(body.salary ?? oldRow?.salary);
  const amount = num(body.amount ?? oldRow?.amount);
  const interestRate =
    requestType === "Loan" ? num(body.interestRate ?? oldRow?.interestRate) : 0;

  const tenureMonths =
    requestType === "Loan" ? num(body.tenureMonths ?? oldRow?.tenureMonths) : 0;

  const limitPercent = num(body.limitPercent ?? oldRow?.limitPercent ?? 30);

  const calc = buildCalculation({
    requestType,
    salary,
    amount,
    interestRate,
    tenureMonths,
    limitPercent,
  });

  const outstandingSnapshot = normalizeOutstandingSnapshot(
    body.customerOutstandingSnapshot || oldRow?.customerOutstandingSnapshot,
  );

  const customerOutstandingTotal = outstandingSnapshot.reduce(
    (sum, x) => sum + num(x.amount),
    0,
  );

  const employeeIdRaw =
    body.employeeId ||
    body.userId ||
    body.staffId ||
    body.employee ||
    oldRow?.employeeId ||
    oldRow?.employeeIdText ||
    "";

  const attachmentFromText = normalizeAttachment(
    body.guardianApprovalAttachment || oldRow?.guardianApprovalAttachment,
  );

  const attachmentFromArray = normalizeAttachment(
    body.guardianApprovalAttachments || oldRow?.guardianApprovalAttachments,
  );

  const guardianApprovalAttachments = [
    ...attachmentFromArray,
    ...attachmentFromText,
  ].filter((x) => x.url || x.fileName);

  return {
    database,

    requestNo: oldRow?.requestNo || str(body.requestNo) || requestNo(),
    requestDate: str(body.requestDate || oldRow?.requestDate) || todayDate(),

    requestType,

    employeeId: toObjectId(employeeIdRaw),
    employeeIdText: str(employeeIdRaw),

    employeeName: str(
      body.employeeName ||
        body.name ||
        body.nameSnapshot ||
        oldRow?.employeeName ||
        "",
    ),

    salary,
    amount,
    interestRate,
    tenureMonths,

    monthlyEmi: calc.monthlyEmi,
    totalPayable: calc.totalPayable,
    totalInterest: calc.totalInterest,

    paidAmount: num(body.paidAmount ?? oldRow?.paidAmount),
    outstandingAmount:
      oldRow?.status === "Approved"
        ? num(oldRow?.outstandingAmount || amount)
        : calc.totalPayable || amount,

    limitPercent,
    allowedLimitAmount: calc.allowedLimitAmount,
    isWithinLimit: calc.isWithinLimit,

    reason: str(body.reason || oldRow?.reason || ""),

    guardianApprovalAttachment: str(
      body.guardianApprovalAttachment ||
        oldRow?.guardianApprovalAttachment ||
        "",
    ),

    guardianApprovalAttachments,

    customerOutstandingSnapshot: outstandingSnapshot,
    customerOutstandingTotal,
    customerOutstandingCount: outstandingSnapshot.length,

    riskRemark: str(body.riskRemark || oldRow?.riskRemark || ""),

    status: oldRow?.status || body.status || "Pending",

    approvalRemark: str(body.approvalRemark || oldRow?.approvalRemark || ""),

    // Payment fields must be changed only by payLoanAdvance().
    paymentStatus: str(oldRow?.paymentStatus || "Unpaid") || "Unpaid",
    paymentRemark: str(oldRow?.paymentRemark || ""),
    paidBy: toObjectId(oldRow?.paidBy),
    paidByName: str(oldRow?.paidByName || ""),
    paidAt: str(oldRow?.paidAt || ""),
    paidOn: str(oldRow?.paidOn || ""),

    requestedBy: toObjectId(body.requestedBy || oldRow?.requestedBy),
    createdBy: toObjectId(body.createdBy || oldRow?.createdBy),
    updatedBy: toObjectId(body.updatedBy || oldRow?.updatedBy),
  };
};

const createOpeningLedger = async (row) => {
  const isLoan = row.requestType === "Loan";
  const now = new Date().toISOString();
  const ledgerDate = toDateOnly(row.requestDate) || todayDate();
  const ledgerMonth = ledgerDate.slice(0, 7);

  const ledger = await HrmEmployeeLedger.create({
    database: row.database,

    employeeId: row.employeeId || null,
    employeeIdText: row.employeeIdText || "",
    employeeName: row.employeeName || "",

    requestId: row._id,

    date: ledgerDate,
    month: ledgerMonth,

    type: row.requestType,

    particulars: isLoan
      ? `Loan approved. EMI ${money(row.monthlyEmi)} for ${
          row.tenureMonths
        } month(s).`
      : `Advance approved. Deduct from salary in ${row.salaryDeductionMonth}.`,

    debit: num(row.amount),
    credit: 0,
    balance: num(row.outstandingAmount || row.amount),

    deductionMode: row.deductionMode,
    deductionAmount: row.salaryDeductionAmount,
    deductionMonth: row.salaryDeductionMonth,
    deductionStartMonth: row.deductionStartMonth,

    source: "LoansAdvancesScreen",
    referenceNo: row.requestNo,

    createdAt: now,
  });

  return ledger;
};

export const createLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const payload = buildPayload(req.body, database);

    validatePayload(payload, "create");
    await validateActiveBasicSalaryLimit({ payload });

    const row = await HrmLoanAdvance.create(payload);

    return success(res, "Loan / advance request saved successfully.", row);
  } catch (error) {
    return fail(res, 400, "Unable to save loan / advance request.", error);
  }
};

export const listLoanAdvances = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const query = {
      database,
      status: { $ne: "Deleted" },
    };

    if (req.query.status) query.status = req.query.status;
    if (req.query.requestType) query.requestType = req.query.requestType;
    if (req.query.paymentStatus) query.paymentStatus = req.query.paymentStatus;

    if (req.query.employeeId) {
      const employeeObjectId = toObjectId(req.query.employeeId);

      query.$or = [
        ...(employeeObjectId ? [{ employeeId: employeeObjectId }] : []),
        { employeeIdText: String(req.query.employeeId) },
      ];
    }

    if (req.query.from || req.query.to) {
      query.requestDate = {};

      if (req.query.from) query.requestDate.$gte = String(req.query.from);
      if (req.query.to) query.requestDate.$lte = String(req.query.to);
    }

    const rows = await HrmLoanAdvance.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return success(res, "Loan / advance list fetched successfully.", rows);
  } catch (error) {
    return fail(res, 500, "Unable to fetch loan / advance list.", error);
  }
};

export const viewLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const row = await HrmLoanAdvance.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    }).lean();

    if (!row) return fail(res, 404, "Loan / advance request not found.");

    return success(res, "Loan / advance request fetched successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to fetch loan / advance request.", error);
  }
};

export const updateLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const oldRow = await HrmLoanAdvance.findOne({
      _id: req.params.id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!oldRow) return fail(res, 404, "Loan / advance request not found.");

    if (!["Pending", "Hold"].includes(oldRow.status)) {
      return fail(
        res,
        400,
        "Only Pending or Hold requests can be edited before approval.",
      );
    }

    const payload = buildPayload(req.body, database, oldRow);

    validatePayload(payload, "update");
    await validateActiveBasicSalaryLimit({
      payload,
      excludeId: req.params.id,
    });

    Object.assign(oldRow, payload);
    await oldRow.save();

    return success(res, "Loan / advance request updated successfully.", oldRow);
  } catch (error) {
    return fail(res, 400, "Unable to update loan / advance request.", error);
  }
};

export const approveLoanAdvance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    let savedRow = null;
    let ledgerRow = null;

    await session.withTransaction(async () => {
      const row = await HrmLoanAdvance.findOne({
        _id: req.params.id,
        database,
        status: { $in: ["Pending", "Hold"] },
      }).session(session);

      if (!row) {
        throw new Error("Pending loan / advance request not found.");
      }

      const mergedPayload = buildPayload(req.body, database, row);

      validatePayload(mergedPayload, "approve");
      await validateActiveBasicSalaryLimit({
        payload: mergedPayload,
        excludeId: row._id,
        session,
      });

      row.employeeId = mergedPayload.employeeId;
      row.employeeIdText = mergedPayload.employeeIdText;
      row.employeeName = mergedPayload.employeeName;

      row.salary = mergedPayload.salary;
      row.amount = mergedPayload.amount;
      row.interestRate = mergedPayload.interestRate;
      row.tenureMonths = mergedPayload.tenureMonths;

      row.monthlyEmi = mergedPayload.monthlyEmi;
      row.totalPayable = mergedPayload.totalPayable;
      row.totalInterest = mergedPayload.totalInterest;

      row.limitPercent = mergedPayload.limitPercent;
      row.allowedLimitAmount = mergedPayload.allowedLimitAmount;
      row.isWithinLimit = mergedPayload.isWithinLimit;

      row.reason = mergedPayload.reason;
      row.guardianApprovalAttachment = mergedPayload.guardianApprovalAttachment;

      row.guardianApprovalAttachments =
        mergedPayload.guardianApprovalAttachments;

      row.customerOutstandingSnapshot =
        mergedPayload.customerOutstandingSnapshot;

      row.customerOutstandingTotal = mergedPayload.customerOutstandingTotal;
      row.customerOutstandingCount = mergedPayload.customerOutstandingCount;

      row.riskRemark = str(req.body.riskRemark || row.riskRemark || "");

      row.status = "Approved";
      row.approvalRemark = str(req.body.approvalRemark || "");
      row.approvedAt = new Date().toISOString();
      row.approvedBy = toObjectId(req.body.approvedBy || req.body.userId);

      row.paidAmount = 0;
      row.outstandingAmount =
        row.requestType === "Loan" ? row.totalPayable : row.amount;
      row.paymentStatus = "Unpaid";
      row.paymentRemark = "";
      row.paidBy = null;
      row.paidByName = "";
      row.paidAt = "";
      row.paidOn = "";

      if (row.requestType === "Loan") {
        row.emiSchedule = buildEmiSchedule(row);
        row.salaryDeductionAmount = row.monthlyEmi;
        row.deductionMode = "Monthly EMI";
        row.deductionStartMonth = monthKey(addMonths(new Date(), 1));
        row.salaryDeductionMonth = "";
      } else {
        row.emiSchedule = [];
        row.salaryDeductionAmount = row.amount;
        row.deductionMode = "Same Month Salary";
        row.salaryDeductionMonth = monthKey();
        row.deductionStartMonth = "";
      }

      savedRow = await row.save({ session });

      const ledgerDate = toDateOnly(row.requestDate) || todayDate();
      const ledgerMonth = ledgerDate.slice(0, 7);

      ledgerRow = await HrmEmployeeLedger.create(
        [
          {
            database: row.database,

            employeeId: row.employeeId || null,
            employeeIdText: row.employeeIdText || "",
            employeeName: row.employeeName || "",

            requestId: row._id,

            date: ledgerDate,
            month: ledgerMonth,

            type: row.requestType,

            particulars:
              row.requestType === "Loan"
                ? `Loan approved. EMI ${money(row.monthlyEmi)} for ${
                    row.tenureMonths
                  } month(s).`
                : `Advance approved. Deduct from salary in ${row.salaryDeductionMonth}.`,

            debit: num(row.amount),
            credit: 0,
            balance: num(row.outstandingAmount || row.amount),

            deductionMode: row.deductionMode,
            deductionAmount: row.salaryDeductionAmount,
            deductionMonth: row.salaryDeductionMonth,
            deductionStartMonth: row.deductionStartMonth,

            source: "LoansAdvancesScreen",
            referenceNo: row.requestNo,
          },
        ],
        { session },
      );

      ledgerRow = ledgerRow?.[0] || null;
    });

    return success(res, "Request approved and ledger updated successfully.", {
      request: savedRow,
      ledger: ledgerRow,
    });
  } catch (error) {
    return fail(res, 400, "Unable to approve loan / advance request.", error);
  } finally {
    session.endSession();
  }
};

export const rejectLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const row = await HrmLoanAdvance.findOneAndUpdate(
      {
        _id: req.params.id,
        database,
        status: { $in: ["Pending", "Hold"] },
      },
      {
        $set: {
          status: "Rejected",
          approvalRemark: str(req.body.approvalRemark || req.body.reason || ""),
          rejectedAt: new Date().toISOString(),
          rejectedBy: toObjectId(req.body.rejectedBy || req.body.userId),
          updatedBy: toObjectId(req.body.updatedBy || req.body.userId),
        },
      },
      { new: true },
    );

    if (!row)
      return fail(res, 404, "Pending loan / advance request not found.");

    return success(res, "Request rejected successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to reject request.", error);
  }
};

export const holdLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const row = await HrmLoanAdvance.findOneAndUpdate(
      {
        _id: req.params.id,
        database,
        status: { $in: ["Pending", "Hold"] },
      },
      {
        $set: {
          status: "Hold",
          holdReason: str(req.body.holdReason || req.body.reason || ""),
          riskRemark: str(req.body.riskRemark || ""),
          holdAt: new Date().toISOString(),
          holdBy: toObjectId(req.body.holdBy || req.body.userId),
          updatedBy: toObjectId(req.body.updatedBy || req.body.userId),
        },
      },
      { new: true },
    );

    if (!row)
      return fail(res, 404, "Pending loan / advance request not found.");

    return success(res, "Request placed on hold successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to hold request.", error);
  }
};

export const payLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const row = await HrmLoanAdvance.findOne({
      _id: req.params.id,
      database,
      status: "Approved",
    });

    if (!row) {
      return fail(res, 404, "Approved loan / advance request not found.");
    }

    if (row.paymentStatus === "Paid") {
      return success(res, "Loan / advance is already marked as paid.", row);
    }

    row.paymentStatus = "Paid";
    row.paymentRemark = str(
      req.body.paymentRemark ||
        req.body.paidRemark ||
        req.body.remark ||
        req.body.superAdminRemark ||
        "",
    );
    row.paidBy = toObjectId(
      req.body.paidBy || req.body.actionBy || req.body.userId,
    );
    row.paidByName = str(req.body.paidByName || req.body.actionByName || "");
    row.paidAt = new Date().toISOString();
    row.paidOn = todayDate();
    row.updatedBy = toObjectId(
      req.body.updatedBy || req.body.actionBy || req.body.userId,
    );

    await row.save();

    return success(res, "Loan / advance marked as paid successfully.", row);
  } catch (error) {
    return fail(res, 400, "Unable to mark loan / advance as paid.", error);
  }
};

export const deleteLoanAdvance = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const row = await HrmLoanAdvance.findOneAndUpdate(
      {
        _id: req.params.id,
        database,
      },
      {
        $set: {
          status: "Deleted",
          updatedBy: toObjectId(req.body.updatedBy || req.body.userId),
        },
      },
      { new: true },
    );

    if (!row) return fail(res, 404, "Loan / advance request not found.");

    return success(res, "Loan / advance request deleted successfully.", row);
  } catch (error) {
    return fail(res, 500, "Unable to delete loan / advance request.", error);
  }
};

export const listEmployeeLedger = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);

    const query = {
      database,
      status: { $ne: "Deleted" },
    };

    if (req.query.employeeId) {
      const employeeObjectId = toObjectId(req.query.employeeId);

      query.$or = [
        ...(employeeObjectId ? [{ employeeId: employeeObjectId }] : []),
        { employeeIdText: String(req.query.employeeId) },
      ];
    }

    if (req.query.month) query.month = String(req.query.month);
    if (req.query.type) query.type = String(req.query.type);

    const rows = await HrmEmployeeLedger.find(query)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return success(res, "Employee ledger fetched successfully.", rows);
  } catch (error) {
    return fail(res, 500, "Unable to fetch employee ledger.", error);
  }
};

export const getSalaryDeductions = async (req, res) => {
  try {
    const database = cleanDatabase(req.params.database);
    const salaryMonth = String(req.query.month || monthKey());

    const approvedRows = await HrmLoanAdvance.find({
      database,
      status: "Approved",
    }).lean();

    const deductions = [];

    approvedRows.forEach((row) => {
      if (row.requestType === "Advance") {
        if (row.salaryDeductionMonth === salaryMonth) {
          deductions.push({
            requestId: row._id,
            requestType: row.requestType,
            employeeId: row.employeeId,
            employeeIdText: row.employeeIdText,
            employeeName: row.employeeName,
            salaryMonth,
            amount: row.salaryDeductionAmount || row.amount,
            particulars: "Advance deduction from salary",
          });
        }

        return;
      }

      const emi = (row.emiSchedule || []).find(
        (x) => x.dueMonth === salaryMonth && x.status === "Pending",
      );

      if (emi) {
        deductions.push({
          requestId: row._id,
          emiId: emi._id,
          emiNo: emi.emiNo,
          requestType: row.requestType,
          employeeId: row.employeeId,
          employeeIdText: row.employeeIdText,
          employeeName: row.employeeName,
          salaryMonth,
          amount: emi.amount,
          particulars: `Loan EMI ${emi.emiNo}`,
        });
      }
    });

    return success(res, "Salary deductions fetched successfully.", deductions);
  } catch (error) {
    return fail(res, 500, "Unable to fetch salary deductions.", error);
  }
};

export const markSalaryDeduction = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const database = cleanDatabase(req.params.database);

    if (!isValidObjectId(req.params.id)) {
      return fail(res, 400, "Valid request id is required.");
    }

    const salaryMonth = String(
      req.body.salaryMonth || req.query.month || monthKey(),
    );

    let savedRow = null;
    let ledgerRow = null;

    await session.withTransaction(async () => {
      const row = await HrmLoanAdvance.findOne({
        _id: req.params.id,
        database,
        status: "Approved",
      }).session(session);

      if (!row) throw new Error("Approved loan / advance request not found.");

      let deductionAmount = 0;
      let particulars = "";

      if (row.requestType === "Advance") {
        if (row.salaryDeductionMonth !== salaryMonth) {
          throw new Error(
            `This advance is scheduled for ${row.salaryDeductionMonth}.`,
          );
        }

        deductionAmount = num(row.salaryDeductionAmount || row.amount);
        particulars = `Advance deducted from salary for ${salaryMonth}`;

        row.paidAmount = num(row.paidAmount) + deductionAmount;
        row.outstandingAmount = Math.max(
          num(row.outstandingAmount) - deductionAmount,
          0,
        );
        row.status = row.outstandingAmount <= 0 ? "Closed" : "Approved";
      } else {
        const emi = row.emiSchedule.find(
          (x) => String(x.dueMonth) === salaryMonth && x.status === "Pending",
        );

        if (!emi) {
          throw new Error(`No pending EMI found for ${salaryMonth}.`);
        }

        deductionAmount = num(emi.amount);
        particulars = `Loan EMI ${emi.emiNo} deducted from salary for ${salaryMonth}`;

        emi.status = "Deducted";
        emi.deductedFromSalary = true;
        emi.deductedAt = new Date().toISOString();
        emi.salaryMonth = salaryMonth;

        row.paidAmount = num(row.paidAmount) + deductionAmount;
        row.outstandingAmount = Math.max(
          num(row.outstandingAmount) - deductionAmount,
          0,
        );

        if (row.outstandingAmount <= 0) {
          row.status = "Closed";
        }
      }

      const createdLedger = await HrmEmployeeLedger.create(
        [
          {
            database,

            employeeId: row.employeeId || null,
            employeeIdText: row.employeeIdText || "",
            employeeName: row.employeeName || "",

            requestId: row._id,

            date: todayDate(),
            month: salaryMonth,

            type:
              row.requestType === "Loan"
                ? "Loan EMI Deduction"
                : "Advance Deduction",

            particulars,

            debit: 0,
            credit: deductionAmount,
            balance: row.outstandingAmount,

            deductionMode: row.deductionMode,
            deductionAmount,
            deductionMonth: salaryMonth,

            source: "Salary",
            referenceNo: row.requestNo,
          },
        ],
        { session },
      );

      ledgerRow = createdLedger?.[0] || null;
      savedRow = await row.save({ session });
    });

    return success(res, "Salary deduction marked successfully.", {
      request: savedRow,
      ledger: ledgerRow,
    });
  } catch (error) {
    return fail(res, 400, "Unable to mark salary deduction.", error);
  } finally {
    session.endSession();
  }
};
