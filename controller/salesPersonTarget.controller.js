import { SalesPersonTarget } from "../model/SalesPersonTarget.js";

/* ===================== CREATE ===================== */
export const createSalesPersonTarget = async (req, res) => {
  try {
    const {
      database,
      salesPersonId,
      salesPersonName,
      monthName,
      financialYear,
      date,
      incrementPercent,
      grandTotal,
      products,
      created_by,
    } = req.body || {};

    if (!salesPersonId) {
      return res
        .status(400)
        .json({ status: false, message: "salesPersonId is required" });
    }
    if (!monthName || !financialYear) {
      return res.status(400).json({
        status: false,
        message: "monthName and financialYear are required",
      });
    }

    const normalizedProducts = (products || []).map((p) => {
      const qty = Number(p.qtyAssign || 0);
      const price = Number(p.price || 0);
      const total =
        p.totalPrice != null
          ? Number(p.totalPrice)
          : Number((qty * price).toFixed(2));

      return {
        productId: p.productId,
        qtyAssign: qty,
        price,
        totalPrice: total,
        assignPercentage: Array.isArray(p.assignPercentage)
          ? p.assignPercentage
          : [],
      };
    });

    const doc = new SalesPersonTarget({
      database,
      salesPersonId,
      salesPersonName,
      monthName,
      financialYear,
      date,
      incrementPercent: Number(incrementPercent) || 0,
      grandTotal: Number(grandTotal) || 0,
      products: normalizedProducts,
      created_by,
    });

    await doc.save();

    return res.json({
      status: true,
      message: "Sales Person Target created successfully",
      data: doc,
    });
  } catch (err) {
    console.error("[createSalesPersonTarget] error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

/* ===================== LIST ===================== */
export const listSalesPersonTargets = async (req, res) => {
  try {
    const { database, salesPersonId, financialYear, monthName, status } =
      req.query || {};

    const filter = {};
    if (database) filter.database = database;
    if (salesPersonId) filter.salesPersonId = salesPersonId;
    if (financialYear) filter.financialYear = financialYear;
    if (monthName) filter.monthName = monthName;
    filter.status = status || { $ne: "Deactive" };

    const docs = await SalesPersonTarget.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ status: true, data: docs });
  } catch (err) {
    console.error("[listSalesPersonTargets] error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

/* ===================== VIEW BY ID ===================== */
export const getSalesPersonTargetById = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res
        .status(400)
        .json({ status: false, message: "Target id is required" });
    }

    const doc = await SalesPersonTarget.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ status: false, message: "Sales Person Target not found" });
    }

    return res.json({ status: true, data: doc });
  } catch (err) {
    console.error("[getSalesPersonTargetById] error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

/* ===================== UPDATE ===================== */
export const updateSalesPersonTarget = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res
        .status(400)
        .json({ status: false, message: "Target id is required" });
    }

    const {
      salesPersonId,
      salesPersonName,
      monthName,
      financialYear,
      date,
      incrementPercent,
      grandTotal,
      products,
      status,
    } = req.body || {};

    const doc = await SalesPersonTarget.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ status: false, message: "Sales Person Target not found" });
    }

    if (salesPersonId) doc.salesPersonId = salesPersonId;
    if (salesPersonName != null) doc.salesPersonName = salesPersonName;
    if (monthName) doc.monthName = monthName;
    if (financialYear) doc.financialYear = financialYear;
    if (date) doc.date = date;
    if (incrementPercent != null)
      doc.incrementPercent = Number(incrementPercent) || 0;
    if (grandTotal != null) doc.grandTotal = Number(grandTotal) || 0;
    if (status) doc.status = status;

    if (Array.isArray(products)) {
      doc.products =
        products.map((p) => {
          const qty = Number(p.qtyAssign || 0);
          const price = Number(p.price || 0);
          const total =
            p.totalPrice != null
              ? Number(p.totalPrice)
              : Number((qty * price).toFixed(2));

          return {
            productId: p.productId,
            qtyAssign: qty,
            price,
            totalPrice: total,
            assignPercentage: Array.isArray(p.assignPercentage)
              ? p.assignPercentage
              : [],
          };
        }) || [];
    }

    await doc.save();

    return res.json({
      status: true,
      message: "Sales Person Target updated successfully",
      data: doc,
    });
  } catch (err) {
    console.error("[updateSalesPersonTarget] error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

/* ===================== DELETE (SOFT) ===================== */
export const deleteSalesPersonTarget = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res
        .status(400)
        .json({ status: false, message: "Target id is required" });
    }

    const doc = await SalesPersonTarget.findByIdAndUpdate(
      id,
      { status: "Deactive" },
      { new: true }
    );

    if (!doc) {
      return res
        .status(404)
        .json({ status: false, message: "Sales Person Target not found" });
    }

    return res.json({
      status: true,
      message: "Sales Person Target deleted (Deactive) successfully",
      data: doc,
    });
  } catch (err) {
    console.error("[deleteSalesPersonTarget] error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};
