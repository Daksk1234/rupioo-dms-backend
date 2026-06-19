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

export const saveCompanyDetails = async (req, res, next) => {
  try {
    const user = await User.findById({ _id: req.body.created_by });

    if (!user) {
      return res.status(400).json({
        message: "User Not Found",
        status: false,
      });
    }

    req.body.database = user.database;

    if (req.files) {
      req.files.map((file) => {
        if (file.fieldname === "signature") {
          req.body.signature = file.filename;
        } else if (file.fieldname === "qr_code") {
          req.body.qr_code = file.filename;
        } else {
          req.body.logo = file.filename;
        }
      });
    }

    if (req.body.bankDetails) {
      req.body.bankDetails = parseJsonArray(req.body.bankDetails);
    }

    // New FY-wise Prefix/Suffix save logic
    req.body = normalizeInvoiceSeriesForSave(req.body);

    const companyDetail = await CompanyDetails.find({
      database: user.database,
    }).sort({ sortorder: -1 });

    if (companyDetail.length === 0) {
      const createdCompanyDetail = await CompanyDetails.create(req.body);

      return createdCompanyDetail
        ? res.status(200).json({
            message: "data save successfull",
            CompanyDetail: createdCompanyDetail,
            status: true,
          })
        : res.status(400).json({
            message: "something went wrong",
            status: false,
          });
    }

    const companyId = companyDetail[0]._id;

    const existingDetails = await CompanyDetails.findById({
      _id: companyId,
    });

    if (!existingDetails) {
      return res.status(404).json({
        error: "company detail not found",
        status: false,
      });
    }

    const updateDetails = await CompanyDetails.findByIdAndUpdate(
      companyId,
      req.body,
      { new: true },
    );

    return updateDetails
      ? res.status(200).json({
          message: "Data Updated Successfully",
          updateDetails,
          CompanyDetail: updateDetails,
          status: true,
        })
      : res.status(400).json({
          message: "Something Went Wrong",
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
