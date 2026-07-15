// File: controller/receipt.controller.js
import ExcelJS from "exceljs";
import { Receipt } from "../model/receipt.model.js";
import {
  ledgerExpensesForCredit,
  ledgerExpensesForDebit,
  ledgerPartyForCredit,
  ledgerPartyForDebit,
  ledgerTransporterForCredit,
  ledgerTransporterForDebit,
  ledgerUserForCredit,
  ledgerUserForDebit,
} from "../service/ledger.js";
import { Customer } from "../model/customer.model.js";
import { DeleteOverDue, UpdateOverDue, overDue1 } from "../service/overDue.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { SalesReturn } from "../model/salesReturn.model.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
import { PurchaseReturn } from "../model/purchaseReturn.model.js";
import { PaymentDueReport } from "../model/payment.due.report.js";
import { OtpVerify } from "../model/otpVerify.model.js";
import { User } from "../model/user.model.js";
import { Ledger } from "../model/ledger.model.js";
import { CreateAccount } from "../model/createAccount.model.js";
import { Transporter } from "../model/transporter.model.js";
import { CompanyDetails } from "../model/companyDetails.model.js";
import mongoose from "mongoose";

const CASH_PARTY_SID = "CASH7845";
const CASH_ID = "CASH";

const isCashId = (id) =>
  String(id || "")
    .trim()
    .toUpperCase() === CASH_ID;

const toObjIdArray = (ids) =>
  (ids || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const getIdString = (val) => {
  if (!val) return "";
  if (typeof val === "object") return String(val?._id || val?.id || "");
  return String(val);
};

const isCashPaymentMode = (paymentMode) =>
  String(paymentMode || "")
    .trim()
    .toLowerCase() === "cash";

const isBankPaymentMode = (paymentMode) => !isCashPaymentMode(paymentMode);

export const normalizeReceiptBankFields = (data) => {
  const out = { ...data };

  const pm = String(out?.paymentMode || "");
  const isBank = pm && pm.toLowerCase() !== "cash";

  if (!isBank) {
    if (out.bankSelect === undefined) out.bankSelect = "";
    out.bankDetails = undefined;
    return out;
  }

  const bd = out.bankDetails;

  const maybeId =
    bd && typeof bd === "object" ? bd?._id || bd?.id || "" : bd || "";

  if (!maybeId || String(maybeId).trim() === "") {
    out.bankDetails = undefined;
    return out;
  }

  const idStr = String(maybeId);
  if (mongoose.Types.ObjectId.isValid(idStr)) {
    out.bankDetails = new mongoose.Types.ObjectId(idStr);
  } else {
    out.bankDetails = maybeId;
  }

  return out;
};

export const applyReceiptTransferFlags = async (data) => {
  const out = {
    ...data,
    isCashToBank: false,
    isBankToCash: false,
  };

  const database = out?.database;
  const type = String(out?.type || "")
    .trim()
    .toLowerCase();
  const paymentMode = String(out?.paymentMode || "")
    .trim()
    .toLowerCase();

  if (!database) return out;

  // only handle CASH party + Bank mode
  if (paymentMode === "bank" && out?.partyId) {
    const partyId = String(out.partyId);

    let cashParty = null;

    if (mongoose.Types.ObjectId.isValid(partyId)) {
      cashParty = await Customer.findOne({
        _id: new mongoose.Types.ObjectId(partyId),
        database,
        status: "Active",
        sId: "CASH7845",
      })
        .select("_id sId")
        .lean();
    }

    if (!cashParty) {
      cashParty = await Customer.findOne({
        database,
        status: "Active",
        sId: "CASH7845",
        $or: [{ id: partyId }, { sId: partyId }],
      })
        .select("_id sId")
        .lean();
    }

    if (cashParty) {
      if (type === "receipt") {
        out.isCashToBank = true;
      } else if (type === "payment") {
        out.isBankToCash = true;
      }
    }
  }

  return out;
};

const getFinancialYearLabel = (dateValue = new Date()) => {
  let d = new Date(dateValue);

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String(startYear + 1).slice(-2);

  return `${startYear}-${endYearShort}`;
};

/* ========================= RECEIPT ========================= */

export const saveReceipt = async (req, res, next) => {
  try {
    const partyReceipt = [];

    for (const item of req.body.Receipt) {
      const isBankPayment = item.paymentMode !== "Cash";
      const paymentMode = isBankPayment ? "Bank" : "Cash";

      const rece = await Receipt.find({ status: "Active", paymentMode }).sort({
        sortorder: -1,
      });

      if (rece.length > 0) {
        const latestReceipt = rece[rece.length - 1];
        req.body.voucherNo = latestReceipt.voucherNo + 1;
      } else {
        req.body.voucherNo = 1;
      }

      req.body.voucherType = "receipt";
      req.body.voucherDate = new Date();
      req.body.lockStatus = "No";

      item.financialYear =
        item.financialYear || getFinancialYearLabel(item.date);

      let receiptData = normalizeReceiptBankFields({ ...req.body, ...item });
      receiptData = await applyReceiptTransferFlags(receiptData);

      const receipt = await Receipt.create(receiptData);

      if (receipt.type === "receipt") {
        const particular = receipt.paymentMode + " " + "receipt";

        if (item.partyId) {
          await ledgerPartyForCredit(receipt, particular);
        } else if (item.userId) {
          await ledgerUserForCredit(receipt, particular);
        } else if (item.expenseId) {
          await ledgerExpensesForCredit(receipt, particular);
        } else {
          await ledgerTransporterForCredit(receipt, particular);
        }
      }

      if (item.partyId) {
        req.body.orderId = receipt._id.toString();
        const dueData = { ...req.body, ...item };
        await overDue1(dueData);
        await PaymentDueReport.create(dueData);
      }

      partyReceipt.push(receipt);
    }

    return partyReceipt.length > 0
      ? res
          .status(200)
          .json({ message: "Receipt Saved Successfully!", status: true })
      : res.status(404).json({ message: "Receipt Not Found", status: false });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const UpdateReceipt = async (req, res, next) => {
  try {
    const existingReceipt = await Receipt.findById(req.params.id);
    if (!existingReceipt) {
      return res
        .status(404)
        .json({ message: "Receipt Not Found", status: false });
    }

    let previousamount = existingReceipt.amount;
    req.body.voucherType = "receipt";
    req.body.voucherDate = new Date();
    req.body.lockStatus = "No";
    req.body.financialYear =
      req.body.financialYear ||
      getFinancialYearLabel(req.body.date || existingReceipt.date);

    let updatedBody = normalizeReceiptBankFields({ ...req.body });
    updatedBody = await applyReceiptTransferFlags(updatedBody);

    const updatedReceipt = await Receipt.findByIdAndUpdate(
      req.params.id,
      updatedBody,
      { new: true },
    );

    if (updatedReceipt.type === "receipt") {
      if (updatedReceipt.partyId) {
        updatedBody.credit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else if (updatedReceipt.userId) {
        updatedBody.credit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else if (updatedReceipt.expenseId) {
        updatedBody.credit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else {
        updatedBody.credit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      }
    }

    if (updatedReceipt.partyId) {
      await UpdateOverDue(updatedBody, previousamount);
      await PaymentDueReport.findOneAndUpdate(
        { orderId: existingReceipt._id.toString() },
        updatedBody,
        { new: true },
      );
    }

    return res.status(200).json({
      message: "Receipt Updated Successfully!",
      status: true,
      receipt: updatedReceipt,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const viewReceipt = async (req, res, next) => {
  try {
    const receiptDatabase = req.params.database; // example: "company-2026-27"

    // Remove financial year suffix only for master data lookup
    // "company-2026-27" => "company"
    // "my-company-db-2026-27" => "my-company-db"
    const mainDatabase = String(receiptDatabase || "").replace(
      /-\d{4}-\d{2}$/,
      "",
    );

    const receipts = await Receipt.find({
      database: receiptDatabase, // keep FY database for Receipt
      status: "Active",
    })
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "transporterId", model: "transporter" })
      .lean();

    if (!receipts.length) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const expenseIds = [];

    for (const r of receipts) {
      if (
        r?.expenseId &&
        mongoose.Types.ObjectId.isValid(String(r.expenseId))
      ) {
        expenseIds.push(String(r.expenseId));
      }
    }

    const uniqueExpenseIds = [...new Set(expenseIds)];

    const createAccMap = new Map();

    if (uniqueExpenseIds.length) {
      const accDocs = await CreateAccount.find({
        _id: { $in: uniqueExpenseIds },
        database: mainDatabase, // use main database for CreateAccount
        status: "Active",
      }).lean();

      for (const d of accDocs) {
        createAccMap.set(String(d._id), d);
      }
    }

    const remainingIds = uniqueExpenseIds.filter((x) => !createAccMap.has(x));

    let bankMap = new Map();

    if (remainingIds.length) {
      const company = await CompanyDetails.findOne({
        database: mainDatabase, // use main database for CompanyDetails
      }).lean();

      if (company && Array.isArray(company.bankDetails)) {
        for (const b of company.bankDetails) {
          const bid = b?._id ? String(b._id) : null;

          if (bid) {
            bankMap.set(bid, b);
          }
        }
      }
    }

    const finalReceipts = receipts.map((r) => {
      const out = { ...r };

      const expId = out?.expenseId ? String(out.expenseId) : "";

      if (expId && mongoose.Types.ObjectId.isValid(expId)) {
        const acc = createAccMap.get(expId);

        if (acc) {
          out.expenseId = acc;
        } else {
          const bank = bankMap.get(expId);

          if (bank) {
            out.expenseId = {
              ...bank,
              _fromCompanyBankDetails: true,
            };
          }
        }
      }

      return out;
    });

    return res.status(200).json({
      Receipts: finalReceipts,
      status: true,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};

export const ViewReceiptById = async (req, res, next) => {
  try {
    let receipt = await Receipt.findById({ _id: req.params.id })
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "expenseId", model: "createAccount" })
      .populate({ path: "transporterId", model: "transporter" });

    return receipt
      ? res.status(200).json({ Receipts: receipt, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const DeleteReceipt = async (req, res, next) => {
  try {
    const receipt = await Receipt.findById({ _id: req.params.id });
    if (!receipt) {
      return res.status(404).json({ error: "Not Found", status: false });
    }

    receipt.status = "Deactive";
    await receipt.save();
    await Ledger.findOneAndDelete({ orderId: req.params.id });
    await PaymentDueReport.findOneAndDelete({ orderId: req.params.id });

    if (receipt.partyId && receipt.type === "receipt") {
      await DeleteOverDue(receipt);
    }

    return res.status(200).json({ message: "delete successful", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};

/* ========================= PAYMENT ========================= */

export const savePayment = async (req, res, next) => {
  try {
    const partyReceipt = [];

    for (const item of req.body.Payment) {
      let query = { status: "Active" };
      let isBankPayment =
        item.type === "payment" && item.paymentMode !== "Cash";
      query.paymentMode = isBankPayment ? "Bank" : "Cash";

      const rece = await Receipt.find(query).sort({ sortorder: -1 });
      if (rece.length > 0) {
        const latestReceipt = rece[rece.length - 1];
        req.body.voucherNo = latestReceipt.voucherNo + 1;
      } else {
        req.body.voucherNo = 1;
      }

      req.body.voucherType = "payment";

      item.financialYear =
        item.financialYear || getFinancialYearLabel(item.date);

      let receiptData = { ...req.body, ...item };
      receiptData = normalizeReceiptBankFields(receiptData);
      receiptData = await applyReceiptTransferFlags(receiptData);

      const receipt = await Receipt.create(receiptData);

      if (receipt.type === "payment") {
        const particular = receipt.paymentMode + " " + "payment";
        if (item.partyId) {
          await ledgerPartyForDebit(receipt, particular);
        } else if (item.userId) {
          await ledgerUserForDebit(receipt, particular);
        } else if (item.expenseId) {
          await ledgerExpensesForDebit(receipt, particular);
        } else {
          await ledgerTransporterForDebit(receipt, particular);
        }
      }

      partyReceipt.push(receipt);
    }

    return partyReceipt.length > 0
      ? res
          .status(200)
          .json({ message: "Payment Saved Successfully!", status: true })
      : res.status(404).json({ message: "Payment Not Found", status: false });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const UpdatePayment = async (req, res, next) => {
  try {
    const existingReceipt = await Receipt.findById(req.params.id);
    if (!existingReceipt) {
      return res
        .status(404)
        .json({ message: "Payment Not Found", status: false });
    }

    req.body.voucherType = "payment";
    req.body.financialYear =
      req.body.financialYear ||
      getFinancialYearLabel(req.body.date || existingReceipt.date);

    let updatedBody = normalizeReceiptBankFields({ ...req.body });
    updatedBody = await applyReceiptTransferFlags(updatedBody);

    const updatedReceipt = await Receipt.findByIdAndUpdate(
      req.params.id,
      updatedBody,
      { new: true },
    );

    if (updatedReceipt.type === "payment") {
      if (updatedReceipt.partyId) {
        updatedBody.debit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else if (updatedReceipt.userId) {
        updatedBody.debit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else if (updatedReceipt.expenseId) {
        updatedBody.debit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      } else {
        updatedBody.debit = updatedReceipt.amount;
        await Ledger.findOneAndUpdate(
          { orderId: existingReceipt._id.toString() },
          updatedBody,
          { new: true },
        );
      }
    }

    return res.status(200).json({
      message: "Payment Updated Successfully!",
      status: true,
      receipt: updatedReceipt,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const DeletePayment = async (req, res, next) => {
  try {
    const receipt = await Receipt.findById({ _id: req.params.id });
    if (!receipt) {
      return res
        .status(404)
        .json({ error: "Payment Not Found", status: false });
    }

    receipt.status = "Deactive";
    await receipt.save();
    await Ledger.findOneAndDelete({ orderId: req.params.id });

    return res
      .status(200)
      .json({ message: "Payment Delete Successfull!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

/* ========================= RECEIPT EXCEL ========================= */

export const saveReceiptWithExcel = async (req, res) => {
  try {
    let voucherDate = "voucherDate";
    let voucherNo = "voucherNo";
    let voucherType = "voucherType";
    let lockStatus = "lockStatus";
    let partyId = "partyId";
    let transporterId = "transporterId";
    let userId = "userId";
    let database = "database";
    let type = "type";
    let expenseId = "expenseId";

    const filePath = await req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    const headerRow = worksheet.getRow(1);
    const headings = [];

    headerRow.eachCell((cell) => {
      headings.push(cell.value);
    });

    const existingParts = [];
    const existingUsers = [];
    const existingExpenses = [];
    const transporterExist = [];
    const notExistCode = [];

    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const dataRow = worksheet.getRow(rowIndex);
      const document = {};

      for (let columnIndex = 1; columnIndex <= headings.length; columnIndex++) {
        const heading = headings[columnIndex - 1];
        const cellValue = dataRow.getCell(columnIndex).value;
        document[heading] = cellValue;
      }

      document[type] = "receipt";
      document[database] = req.params.database;

      if (document.partyId) {
        const customer = await Customer.findOne({
          id: document.partyId,
          database: document.database,
          status: "Active",
        });

        if (customer) {
          document[userId] = undefined;
          document[expenseId] = undefined;
          document[transporterId] = undefined;
          document[partyId] = customer._id.toString();

          if (document.type === "receipt" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "receipt") {
            let particular = receipt.paymentMode + " " + "receipt";
            await ledgerPartyForCredit(receipt, particular);
          }

          await overDue1(document);
          document[voucherDate] = new Date(new Date());
          document[lockStatus] = "No";
          await PaymentDueReport.create(document);
        } else {
          existingParts.push(document.partyId);
        }
      } else if (!document.userId && !document.partyId) {
        const expense = await CreateAccount.findOne({
          id: document.expenseId,
          database: document.database,
          status: "Active",
        });

        if (expense) {
          document[userId] = undefined;
          document[partyId] = undefined;
          document[transporterId] = undefined;
          document[expenseId] = expense._id.toString();

          if (document.type === "receipt" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "receipt") {
            let particular = receipt.paymentMode + " " + "receipt";
            await ledgerExpensesForCredit(receipt, particular);
          }
        } else {
          existingExpenses.push(document.expenseId);
        }
      } else if (!document.userId && !document.partyId && !document.expenseId) {
        const transporter = await Transporter.findOne({
          id: document.transporterId,
          database: document.database,
          status: "Active",
        });

        if (transporter) {
          document[userId] = undefined;
          document[partyId] = undefined;
          document[expenseId] = undefined;
          document[transporterId] = transporter._id.toString();

          if (document.type === "receipt" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "receipt") {
            let particular = receipt.paymentMode + " " + "receipt";
            await ledgerTransporterForCredit(receipt, particular);
          }
        } else {
          transporterExist.push(document.transporterId);
        }
      } else {
        document[database] = req.params.database;

        const user = await User.findOne({
          id: document.userId,
          database: document.database,
          status: "Active",
        });

        if (user) {
          document[partyId] = undefined;
          document[expenseId] = undefined;
          document[transporterId] = undefined;
          document[userId] = user._id.toString();

          if (document.type === "receipt" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "receipt";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "receipt") {
            let particular = receipt.paymentMode + " " + "receipt";
            await ledgerUserForCredit(receipt, particular);
          }
        } else {
          existingUsers.push(document.userId);
        }
      }
    }

    let message = "Data Inserted Successfully";
    if (existingParts.length > 0) {
      message = `Some receipt not exist valid partyId: ${existingParts.join(", ")}`;
    } else if (notExistCode.length > 0) {
      message = `Write code fields in these notes: ${notExistCode.join(", ")}`;
    } else if (existingUsers.length > 0) {
      message = `Some Receipt Not Exist Valid UserId : ${existingUsers.join(", ")}`;
    } else if (existingExpenses.length > 0) {
      message = `Some Receipt Not Exist Valid Expenses : ${existingExpenses.join(", ")}`;
    } else if (transporterExist.length > 0) {
      message = `Some Receipt Not Exist Valid Transporter : ${transporterExist.join(", ")}`;
    }

    return res.status(200).json({ message, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

/* ========================= PAYMENT EXCEL ========================= */

export const savePaymentWithExcel = async (req, res) => {
  try {
    let voucherNo = "voucherNo";
    let voucherType = "voucherType";
    let partyId = "partyId";
    let userId = "userId";
    let database = "database";
    let type = "type";
    let expenseId = "expenseId";
    let transporterId = "transporterId";

    const filePath = await req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    const headerRow = worksheet.getRow(1);
    const headings = [];

    headerRow.eachCell((cell) => {
      headings.push(cell.value);
    });

    const existingParts = [];
    const existingUsers = [];
    const notExistCode = [];
    const existingExpenses = [];
    const transporterExist = [];

    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const dataRow = worksheet.getRow(rowIndex);
      const document = {};

      for (let columnIndex = 1; columnIndex <= headings.length; columnIndex++) {
        const heading = headings[columnIndex - 1];
        const cellValue = dataRow.getCell(columnIndex).value;
        document[heading] = cellValue;
      }

      document[type] = "payment";
      document[database] = req.params.database;

      if (document.partyId) {
        const customer = await Customer.findOne({
          id: document.partyId,
          database: document.database,
          status: "Active",
        });

        if (customer) {
          document[userId] = undefined;
          document[expenseId] = undefined;
          document[transporterId] = undefined;
          document[partyId] = customer._id.toString();

          if (document.type === "payment" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "payment") {
            let particular = receipt.paymentMode + " " + "payment";
            await ledgerPartyForDebit(receipt, particular);
          }
        } else {
          existingParts.push(document.partyId);
        }
      } else if (!document.userId && !document.partyId) {
        const expense = await CreateAccount.findOne({
          id: document.expenseId,
          database: document.database,
          status: "Active",
        });

        if (expense) {
          document[userId] = undefined;
          document[partyId] = undefined;
          document[transporterId] = undefined;
          document[expenseId] = expense._id.toString();

          if (document.type === "payment" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "payment") {
            let particular = receipt.paymentMode + " " + "payment";
            await ledgerExpensesForDebit(receipt, particular);
          }
        } else {
          existingExpenses.push(document.expenseId);
        }
      } else if (
        !document.userId &&
        !document.partyId &&
        !document.transporterId
      ) {
        const trasporter = await Transporter.findOne({
          id: document.transporterId,
          database: document.database,
          status: "Active",
        });

        if (trasporter) {
          document[userId] = undefined;
          document[partyId] = undefined;
          document[expenseId] = undefined;
          document[transporterId] = trasporter._id.toString();

          if (document.type === "payment" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "payment") {
            let particular = receipt.paymentMode + " " + "payment";
            await ledgerTransporterForDebit(receipt, particular);
          }
        } else {
          transporterExist.push(document.transporterId);
        }
      } else {
        document[database] = req.params.database;

        const customer = await User.findOne({
          id: document.userId,
          database: document.database,
          status: "Active",
        });

        if (customer) {
          document[partyId] = undefined;
          document[transporterId] = undefined;
          document[expenseId] = undefined;
          document[userId] = customer._id.toString();

          if (document.type === "payment" && document.paymentMode !== "Cash") {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Bank",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          } else {
            const rece = await Receipt.find({
              status: "Active",
              paymentMode: "Cash",
            }).sort({ sortorder: -1 });
            document[voucherType] = "payment";
            document[voucherNo] =
              rece.length > 0 ? rece[rece.length - 1].voucherNo + 1 : 1;
          }

          let normalizedDoc = normalizeReceiptBankFields(document);
          normalizedDoc = await applyReceiptTransferFlags(normalizedDoc);

          const receipt = await Receipt.create(normalizedDoc);

          if (receipt.type === "payment") {
            let particular = receipt.paymentMode + " " + "payment";
            await ledgerUserForDebit(receipt, particular);
          }
        } else {
          existingUsers.push(document.partyId);
        }
      }
    }

    let message = "Data Inserted Successfully";
    if (existingParts.length > 0) {
      message = `Some Payment Not Exist Valid PartyId : ${existingParts.join(", ")}`;
    } else if (notExistCode.length > 0) {
      message = `Write code fields in these notes: ${notExistCode.join(", ")}`;
    } else if (existingUsers.length > 0) {
      message = `Some Payment Not Exist Valid UserId: ${existingUsers.join(", ")}`;
    } else if (existingExpenses.length > 0) {
      message = `Some Payment Not Exist Valid ExpenseId : ${existingExpenses.join(", ")}`;
    } else if (transporterExist.length > 0) {
      message = `Some Payment Not Exist Valid TransporterId : ${transporterExist.join(", ")}`;
    }

    return res.status(200).json({ message, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ProfitLossReport = async (req, res, next) => {
  try {
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const targetQuery = { database: req.params.database };

    if (startDate && endDate) {
      targetQuery.date = { $gte: startDate, $lte: endDate };
    }

    const fetchSalesOrders = CreateOrder.find(targetQuery);
    const fetchSalesReturn = SalesReturn.find(targetQuery);
    const fetchPurchaseOrder = PurchaseOrder.find(targetQuery);
    const fetchPurchaseReturn = PurchaseReturn.find(targetQuery);
    const fetchIncome = Receipt.find({ ...targetQuery, type: "receipt" });
    const fetchExpenses = Receipt.find({ ...targetQuery, type: "payment" });

    const [
      salesOrders,
      salesReturn,
      purchaseOrder,
      purchaseReturn,
      income,
      expenses,
    ] = await Promise.all([
      fetchSalesOrders,
      fetchSalesReturn,
      fetchPurchaseOrder,
      fetchPurchaseReturn,
      fetchIncome,
      fetchExpenses,
    ]);

    const calculateTotal = (items, property) =>
      items.reduce((acc, item) => acc + item[property], 0);

    const ProfitLoss = [
      { salesOrders: calculateTotal(salesOrders, "amount") },
      { salesReturns: calculateTotal(salesReturn, "Return_amount") },
      { purchasesOrder: calculateTotal(purchaseOrder, "amount") },
      { purchasesReturn: calculateTotal(purchaseReturn, "Return_amount") },
      { incomes: calculateTotal(income, "amount") },
      { expenses: calculateTotal(expenses, "amount") },
    ];

    return res.status(200).json({ ProfitLoss, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const CashBookReport = async (req, res, next) => {
  try {
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const salesOrders = await CreateOrder.find({
      database: req.params.database,
      status: "completed",
    }).populate({ path: "partyId", model: "customer" });

    const salesData = salesOrders
      .filter((order) => order?.partyId?.paymentTerm === "cash")
      .map((order) => ({
        party: order.partyId?.CompanyName || "",
        invoiceId: order.invoiceId || "",
        amount: order.grandTotal || 0,
        date: order.date,
        type: "receipt",
      }));

    const purchaseOrders = await PurchaseOrder.find({
      database: req.params.database,
      status: "completed",
    }).populate({ path: "partyId", model: "customer" });

    const purchaseData = purchaseOrders
      .filter((order) => order?.partyId?.paymentTerm === "cash")
      .map((order) => ({
        party: order.partyId?.CompanyName || "",
        amount: order.grandTotal || 0,
        invoiceId: order.invoiceId || "",
        date: order.date,
        type: "receipt",
      }));

    const accountDetails = await User.findOne({
      id: "CASH ACCOUNT-Cash-in-hand",
    });
    const userId = accountDetails?._id;

    const query1 = {
      database: req.params.database,
      paymentMode: "Cash",
      status: "Active",
    };

    const query2 = {
      status: "Active",
      userId: userId,
    };

    if (startDate && endDate) {
      query1.createdAt = { $gte: startDate, $lte: endDate };
      query2.createdAt = { $gte: startDate, $lte: endDate };
    }

    const receipts1 = await Receipt.find(query1).select("_id");
    const receipts2 = await Receipt.find(query2).select("_id");

    const ids1 = new Set(receipts1.map((r) => r._id.toString()));
    const ids2 = new Set(receipts2.map((r) => r._id.toString()));
    const combinedIds = [...new Set([...ids1, ...ids2])];

    const receipts = await Receipt.find({ _id: { $in: combinedIds } })
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "expenseId", model: "createAccount" })
      .populate({ path: "transporterId", model: "transporter" });

    if (!receipts.length) {
      return res
        .status(404)
        .json({ message: "No receipts found", status: false });
    }

    return res.status(200).json({
      CashBook: {
        salesData,
        purchaseData,
        receipts,
      },
      status: true,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const BankAccountReport = async (req, res, next) => {
  try {
    const receiptDatabase = req.params.database;
    const mainDatabase = String(receiptDatabase || "").replace(
      /-\d{4}-\d{2}$/,
      "",
    );

    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const targetQuery = {
      database: receiptDatabase, // keep FY database for Receipt
      paymentMode: { $in: ["Bank", "Cash"] },
      status: "Active",
    };

    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
    }

    const receipts = await Receipt.find(targetQuery)
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "transporterId", model: "transporter" })
      .lean();

    if (!receipts.length) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const bankIdStrings = [
      ...new Set(
        receipts
          .map((r) => r?.bankDetails)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    const expenseIdStrings = [
      ...new Set(
        receipts
          .map((r) => r?.expenseId)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    const allCandidateIds = [
      ...new Set(
        [...bankIdStrings, ...expenseIdStrings].filter(
          (id) => id && !isCashId(id),
        ),
      ),
    ];

    const candidateObjIds = toObjIdArray(allCandidateIds);

    const expenseDocs = candidateObjIds.length
      ? await CreateAccount.find({
          _id: { $in: candidateObjIds },
          database: mainDatabase, // use normal database here
        }).lean()
      : [];

    const expenseMap = new Map(
      expenseDocs.map((d) => [String(d._id), { ...d, _kind: "expense" }]),
    );

    const unresolvedForBankSubdoc = allCandidateIds.filter(
      (id) =>
        mongoose.Types.ObjectId.isValid(id) && !expenseMap.has(String(id)),
    );

    const bankMap = new Map();

    if (unresolvedForBankSubdoc.length) {
      const bankObjIds = toObjIdArray(unresolvedForBankSubdoc);

      const companies = await CompanyDetails.find({
        database: mainDatabase, // use normal database here
        "bankDetails._id": { $in: bankObjIds },
      }).lean();

      for (const company of companies) {
        for (const bank of company.bankDetails || []) {
          const bankKey = String(bank._id);
          if (!unresolvedForBankSubdoc.includes(bankKey)) continue;

          bankMap.set(bankKey, {
            ...bank,
            _kind: "bank",
            companyId: company._id,
            companyName: company.name,
            companyGstNo: company.gstNo,
          });
        }
      }
    }

    const resolveBankDetailsObject = (id) => {
      if (!id) return null;

      const key = String(id);

      if (isCashId(key)) {
        return {
          _id: CASH_ID,
          bankName: "Cash",
          isCash: true,
          _kind: "cash",
        };
      }

      const exp = expenseMap.get(key);
      if (exp) {
        return {
          ...exp,
          bankName: exp?.title || exp?.name || "Account",
          _kind: "expense_as_bank",
        };
      }

      return bankMap.get(key) || null;
    };

    const resolveExpenseIdObject = (id) => {
      if (!id) return null;

      const key = String(id);

      if (isCashId(key)) {
        return {
          _id: CASH_ID,
          title: "Cash",
          isCash: true,
          _kind: "cash",
        };
      }

      const exp = expenseMap.get(key);
      if (exp) return exp;

      const bank = bankMap.get(key);
      if (bank) {
        return {
          ...bank,
          title:
            bank?.bankName +
              (bank?.accountNumber ? ` (${bank.accountNumber})` : "") || "Bank",
          _kind: "bank_as_expense",
        };
      }

      return null;
    };

    const finalReceipts = receipts.map((receipt) => {
      const bankKey = receipt?.bankDetails ? String(receipt.bankDetails) : null;
      const expKey = receipt?.expenseId ? String(receipt.expenseId) : null;

      const resolvedBankDetails = bankKey
        ? resolveBankDetailsObject(bankKey)
        : null;

      const resolvedExpenseId = expKey ? resolveExpenseIdObject(expKey) : null;

      return {
        ...receipt,
        bankDetails: bankKey ? resolvedBankDetails : null,
        expenseId: resolvedExpenseId || receipt.expenseId,
      };
    });

    return res.status(200).json({
      BankAccount: finalReceipts,
      status: true,
    });
  } catch (err) {
    console.error("BankAccountReport error:", err);

    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};

export const TaxReport = async (req, res, next) => {
  try {
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const targetQuery = { database: req.params.database };

    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
    }

    let purchaseTax = 0;
    let salesTax = 0;

    const purchaseOrder = await PurchaseOrder.find(targetQuery);
    if (purchaseOrder.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const salesOrder = await CreateOrder.find(targetQuery);
    if (salesOrder.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const purchaseReturn = await PurchaseReturn.find(targetQuery);
    if (purchaseOrder.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const salesReturn = await SalesReturn.find(targetQuery);
    if (salesOrder.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    const purchaseTaxs = purchaseOrder.concat(salesReturn);
    const salesTaxs = salesOrder.concat(purchaseReturn);

    if (salesTaxs.length > 0) {
      for (let order of purchaseTaxs) {
        if (order.igstTotal === 0) {
          purchaseTax += order.cgstTotal + order.sgstTotal;
        } else {
          purchaseTax += order.igstTotal;
        }
      }
    }

    if (purchaseTaxs.length > 0) {
      for (let order of salesTaxs) {
        if (order.igstTotal === 0) {
          salesTax += order.cgstTotal + order.sgstTotal;
        } else {
          salesTax += order.igstTotal;
        }
      }
    }

    const balanceTax = purchaseTax - salesTax;
    const Tax = {
      totalTaxInput: salesTax,
      totalTaxOut: purchaseTax,
      BalanceTax: balanceTax.toFixed(2),
    };

    return res.status(200).json({ Tax: Tax, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};

// --------------------------------------------------------------------

// For DashBoard
export const transactionCalculate = async (req, res, next) => {
  try {
    let transaction = {
      BankAmount: 0,
      CashAmount: 0,
      marketOutstanding: 0,
    };
    let creditAmountBank = 0;
    let debitAmountBank = 0;
    let creditAmountCash = 0;
    let debitAmountCash = 0;

    const receipts = await Receipt.find({
      database: req.params.database,
      status: "Active",
      paymentMode: { $in: ["Bank", "Cash"] },
    }).sort({ sortorder: -1 });

    if (receipts.length === 0) {
      return res
        .status(404)
        .json({ message: "Bank and Cash Balance Not Found", status: false });
    }

    const CompanyAmount = await CompanyDetails.findOne({
      database: req.params.database,
    });

    if (!CompanyAmount) {
      return res
        .status(404)
        .json({ message: "Company details not found", status: false });
    }

    transaction.CashAmount += parseInt(
      CompanyAmount.openingType === "credit"
        ? CompanyAmount.openingBalance
        : -CompanyAmount.openingBalance,
    );

    if (CompanyAmount.bankDetails && CompanyAmount.bankDetails.length > 0) {
      CompanyAmount.bankDetails.forEach((item) => {
        if (!item.openingBalance || !item.openingType) return;
        transaction.BankAmount += parseInt(
          item.openingType === "credit"
            ? item.openingBalance
            : -item.openingBalance,
        );
      });
    }

    receipts.forEach((item) => {
      if (item.paymentMode === "Bank") {
        if (item.type === "receipt") {
          creditAmountBank += item.amount;
        } else if (item.type === "payment") {
          debitAmountBank += item.amount;
        }
      } else if (item.paymentMode === "Cash") {
        if (item.type === "receipt") {
          creditAmountCash += item.amount;
        } else if (item.type === "payment") {
          debitAmountCash += item.amount;
        }
      }
    });

    transaction.BankAmount += creditAmountBank - debitAmountBank;
    transaction.CashAmount += creditAmountCash - debitAmountCash;

    res.status(200).json({ transaction, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};

export const transactionCalculate2 = async (req, res, next) => {
  try {
    const { database } = req.params;

    const aggregationPipeline = [
      {
        $match: {
          database,
          status: "Active",
          paymentMode: { $in: ["Bank", "Cash"] },
        },
      },
      {
        $group: {
          _id: "$paymentMode",
          creditAmount: {
            $sum: {
              $cond: [{ $eq: ["$type", "receipt"] }, "$amount", 0],
            },
          },
          debitAmount: {
            $sum: {
              $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0],
            },
          },
        },
      },
    ];

    const results = await Receipt.aggregate(aggregationPipeline);

    let transaction = {
      BankAmount: 0,
      CashAmount: 0,
      marketOutstanding: 0,
    };

    results.forEach((item) => {
      if (item._id === "Bank") {
        transaction.BankAmount = item.creditAmount - item.debitAmount;
      } else if (item._id === "Cash") {
        transaction.CashAmount = item.creditAmount - item.debitAmount;
      }
    });

    res.status(200).json({ transaction, status: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

// For App
export const PartySendOtp = async (req, res, next) => {
  try {
    if (req.body.partyId) {
      if (req.body.type === "receipt" && req.body.paymentMode !== "Cash") {
        const rece = await Receipt.find({
          status: "Active",
          paymentMode: "Bank",
        }).sort({ sortorder: -1 });

        if (rece.length > 0) {
          const latestReceipt = rece[rece.length - 1];
          req.body.voucherType = "receipt";
          req.body.voucherNo = latestReceipt.voucherNo + 1;
        } else {
          req.body.voucherType = "receipt";
          req.body.voucherNo = 1;
        }
      } else {
        const rece = await Receipt.find({
          status: "Active",
          paymentMode: "Cash",
        }).sort({ sortorder: -1 });

        if (rece.length > 0) {
          const latestReceipt = rece[rece.length - 1];
          req.body.voucherType = "receipt";
          req.body.voucherNo = latestReceipt.voucherNo + 1;
        } else {
          req.body.voucherType = "receipt";
          req.body.voucherNo = 1;
        }
      }

      let finalBody = normalizeReceiptBankFields({ ...req.body });
      finalBody = await applyReceiptTransferFlags(finalBody);

      const receipt = await Receipt.create(finalBody);

      if (receipt.type === "receipt") {
        let particular = req.body.paymentMode + " " + "receipt";
        await ledgerPartyForCredit(receipt, particular);
      }

      req.body.orderId = receipt._id.toString();
      await overDue1(req.body);
      req.body.voucherDate = new Date(new Date());
      req.body.lockStatus = "No";
      await PaymentDueReport.create(req.body);

      return receipt
        ? res
            .status(200)
            .json({ message: "data save successfull", status: true })
        : res.status(404).json({ message: "Not Found", status: false });
    } else {
      return res
        .status(404)
        .json({ message: "PartyId Required..", status: false });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const VerifyPartyPayment = async (req, res, next) => {
  try {
    const existingParty = await Receipt.findOne({ otp: req.body.otp });
    if (!existingParty) {
      return res
        .status(404)
        .json({ message: "otp don't not matched..", status: false });
    }

    if (existingParty.partyId !== req.params.partyId) {
      return res
        .status(404)
        .json({ message: "Party Not Found", status: false });
    }

    existingParty.status = "Active";
    req.body.type = existingParty.type;
    req.body.paymentMode = existingParty.paymentMode;
    req.body.amount = existingParty.amount;

    if (req.body.type === "receipt" && req.body.paymentMode !== "Cash") {
      const rece = await Receipt.find({
        status: "Active",
        paymentMode: "Bank",
      }).sort({ sortorder: -1 });

      if (rece.length > 0) {
        const latestReceipt = rece[rece.length - 1];
        req.body.voucherType = "receipt";
        req.body.voucherNo = latestReceipt.voucherNo + 1;
      } else {
        req.body.voucherType = "receipt";
        req.body.voucherNo = 1;
      }
    } else {
      const rece = await Receipt.find({
        status: "Active",
        paymentMode: "Cash",
      }).sort({ sortorder: -1 });

      if (rece.length > 0) {
        const latestReceipt = rece[rece.length - 1];
        req.body.voucherNo = latestReceipt.voucherNo + 1;
      } else {
        req.body.voucherNo = 1;
      }
    }

    await existingParty.save();

    if (req.body.type === "receipt") {
      let particular = req.body.paymentMode + " receipt";
      await ledgerPartyForCredit(req.body, particular);
    }

    await overDue1(req.body);
    req.body.voucherDate = new Date(new Date());
    req.body.lockStatus = "No";
    await PaymentDueReport.create(req.body);

    return res
      .status(200)
      .json({ message: "data save successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const SaveOtp = async (req, res) => {
  try {
    if (!req.body.otp) {
      return res.status(404).json({ message: "otp required", status: false });
    }

    const existing = await OtpVerify.findOne({
      partyId: req.body.partyId,
      userId: req.body.userId,
    });

    if (!existing) {
      await OtpVerify.create(req.body);
    } else {
      existing.otp = req.body.otp;
      existing.amount = req.body.amount;
      await existing.save();
    }

    return res
      .status(200)
      .json({ message0: "data saved successfull!", status: true });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewOtp = async (req, res) => {
  const { userId, partyId } = req.body;
  try {
    const query = { $or: [{ userId }, { partyId }] };
    const orderData = await OtpVerify.findOne(query);

    if (orderData) {
      return res.status(200).json({ otp: orderData, status: true });
    } else {
      return res.status(404).json({ message: "otp not found", status: false });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const OtpVerifyForReceipt = async (req, res) => {
  try {
    if (!req.body.otp) {
      return res.status(400).json({ message: "otp required", status: false });
    }

    const existingOtp = await OtpVerify.findOne({
      partyId: req.body.partyId,
      otp: req.body.otp,
    });

    if (!existingOtp) {
      return res
        .status(404)
        .json({ message: "maybe partyId or otp don't correct", status: false });
    }

    await OtpVerify.findOneAndDelete({ otp: req.body.otp });

    return res
      .status(200)
      .json({ message: "otp verified successfull!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewReceiptByPartyId = async (req, res, next) => {
  try {
    let receipt = await Receipt.find({
      database: req.params.database,
      partyId: req.params.id,
    })
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" });

    return receipt.length > 0
      ? res.status(200).json({ Receipts: receipt, status: true })
      : res.status(404).json({ message: "Receipt Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewReceiptBySalesPersonId = async (req, res, next) => {
  try {
    let receipt = await Receipt.find({
      database: req.params.database,
      created_by: req.params.id,
    })
      .sort({ sortorder: -1 })
      .populate({ path: "partyId", model: "customer" });

    return receipt.length > 0
      ? res.status(200).json({ Receipts: receipt, status: true })
      : res.status(404).json({ message: "Receipt Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
