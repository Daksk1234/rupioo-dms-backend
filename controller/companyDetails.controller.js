import { CompanyDetails } from "../model/companyDetails.model.js";
import { User } from "../model/user.model.js";
import { getCompanyDetailHierarchyBottomToTop } from "../rolePermission/RolePermission.js";

const getFinancialYearLabel = (date = new Date()) => {
  const d = new Date(date);
  const month = d.getMonth(); // Jan = 0, Apr = 3
  const year = d.getFullYear();

  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String(startYear + 1).slice(-2);

  return `${startYear}-${endYearShort}`;
};

const parseJsonArray = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeInvoiceSeriesForSave = (body = {}) => {
  const currentFY = getFinancialYearLabel();

  let invoiceSeries = parseJsonArray(body.invoiceSeries);

  invoiceSeries = invoiceSeries
    .map((x) => ({
      financialYear: x?.financialYear || x?.fy || "",
      Prefix: x?.Prefix ?? x?.prefix ?? "",
      Suffix: x?.Suffix ?? x?.suffix ?? "",
    }))
    .filter((x) => x.financialYear);

  const currentRowIndex = invoiceSeries.findIndex(
    (x) => x.financialYear === currentFY,
  );

  if (currentRowIndex >= 0) {
    invoiceSeries[currentRowIndex] = {
      ...invoiceSeries[currentRowIndex],
      Prefix: invoiceSeries[currentRowIndex]?.Prefix || body?.Prefix || "",
      Suffix: invoiceSeries[currentRowIndex]?.Suffix || body?.Suffix || "",
    };
  } else {
    invoiceSeries.push({
      financialYear: currentFY,
      Prefix: body?.Prefix || "",
      Suffix: body?.Suffix || "",
    });
  }

  const currentRow =
    invoiceSeries.find((x) => x.financialYear === currentFY) || {};

  body.invoiceSeries = invoiceSeries;

  // Keep old fields active for current FY
  body.Prefix = currentRow?.Prefix || body?.Prefix || "";
  body.Suffix = currentRow?.Suffix || body?.Suffix || "";

  // Same active fields used in localStorage
  body.activeFinancialYear = currentFY;
  body.activeInvoicePrefix = currentRow?.Prefix || body?.Prefix || "";
  body.activeInvoiceSuffix = currentRow?.Suffix || body?.Suffix || "";

  return body;
};

const safeJsonParse = (value, fallback) => {
  try {
    if (!value) return fallback;
    if (typeof value !== "string") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const saveCompanyDetails = async (req, res) => {
  try {
    const body = req.body || {};

    const uploadedFiles = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];

    const logoFile = uploadedFiles.find((f) => f.fieldname === "file");
    const signatureFile = uploadedFiles.find(
      (f) => f.fieldname === "signature",
    );
    const qrCodeFile = uploadedFiles.find((f) => f.fieldname === "qr_code");

    const bankDetails = safeJsonParse(body.bankDetails, []);
    const invoiceSeries = safeJsonParse(body.invoiceSeries, []);

    const existingCompany = await CompanyDetails.findOne({
      // created_by: body.created_by,
      database: body.database,
    });

    const payload = {
      created_by: body.created_by,
      email: body.email || "",
      name: body.name || "",
      mobileNo: body.mobileNo || "",
      database: body.database || "",
      gstNo: body.gstNo || "",
      Prefix: body.Prefix || "",
      Suffix: body.Suffix || "",
      invoiceSeries,
      activeFinancialYear: body.activeFinancialYear || "",
      activeInvoicePrefix: body.activeInvoicePrefix || "",
      activeInvoiceSuffix: body.activeInvoiceSuffix || "",
      address: body.address || "",
      openingBalance: body.openingBalance || 0,
      openingType: body.openingType || "",
      reDate: body.reDate || "",
      bankDetails,

      logo: logoFile?.filename || existingCompany?.logo || "",
      signature: signatureFile?.filename || existingCompany?.signature || "",
      qr_code:
        qrCodeFile?.filename ||
        existingCompany?.qr_code ||
        (typeof body.qr_code === "string" ? body.qr_code : ""),
    };

    let result;

    if (existingCompany) {
      result = await CompanyDetails.findByIdAndUpdate(
        existingCompany._id,
        payload,
        { new: true },
      );
    } else {
      result = await CompanyDetails.create(payload);
    }

    return res.status(200).json({
      status: true,
      message: "Company details saved successfully",
      CompanyDetail: result,
    });
  } catch (error) {
    console.error("saveCompanyDetails error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal server error",
    });
  }
};

export const viewCompanyDetails = async (req, res, next) => {
  try {
    const database = req.params.database;

    const adminDetail = await CompanyDetails.findOne({ database });

    return adminDetail
      ? res.status(200).json({
          CompanyDetail: adminDetail,
          status: true,
        })
      : res.status(400).json({
          message: "Not Found",
          status: false,
        });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};
