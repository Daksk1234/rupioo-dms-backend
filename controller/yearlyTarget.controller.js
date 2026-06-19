// File: controllers/yearlyTarget.controller.js
import YearlyTarget from "../model/yearlyTarget.model.js";

const FY_MONTHS = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
];

const toStr = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const safeNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Number(safeNum(value).toFixed(2));

const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const normalizeMonth = (month) => {
  const found = FY_MONTHS.find(
    (m) => m.toLowerCase() === toStr(month).trim().toLowerCase(),
  );

  return found || "";
};

const getMonthIndex = (month) => {
  const normalized = normalizeMonth(month);
  return FY_MONTHS.indexOf(normalized);
};

const normalizeProductTargets = (items = []) => {
  const rows = Array.isArray(items) ? items : [];

  return rows
    .map((row) => {
      const secondarySize = safeNum(row?.secondarySize) || 1;

      const secondaryQty = safeNum(
        pickFirst(row?.secondaryQty, row?.sQty, row?.secondaryUnitQty),
      );

      const primaryQtyInput = safeNum(
        pickFirst(row?.primaryQty, row?.pQty, row?.qty, row?.qtyAssign),
      );

      const primaryQty =
        primaryQtyInput > 0
          ? primaryQtyInput
          : round2(secondaryQty * secondarySize);

      const saleRate = safeNum(
        pickFirst(row?.basicPrice, row?.saleRate, row?.price, row?.rate),
      );

      const totalInput = safeNum(
        pickFirst(row?.total, row?.totalPrice, row?.targetAmount),
      );

      const total = totalInput > 0 ? totalInput : round2(primaryQty * saleRate);

      const category = toStr(pickFirst(row?.category, row?.catageory)).trim();

      return {
        productId: toStr(row?.productId || row?._id || row?.id || "").trim(),

        productName: toStr(
          pickFirst(
            row?.productName,
            row?.Product_Title,
            row?.name,
            row?.title,
          ),
        ).trim(),

        category,
        catageory: category,

        subCategory: toStr(
          pickFirst(row?.subCategory, row?.SubCategory, row?.subcategory),
        ).trim(),

        color: toStr(
          pickFirst(row?.color, row?.Color, row?.colour, row?.shade),
        ).trim(),

        basicPrice: round2(saleRate),
        saleRate: round2(saleRate),
        price: round2(saleRate),

        secondaryUnitName: toStr(row?.secondaryUnitName || "").trim(),
        primaryUnitName: toStr(row?.primaryUnitName || "").trim(),

        secondarySize: round2(secondarySize),

        secondaryQty: round2(secondaryQty),
        sQty: round2(secondaryQty),

        primaryQty: round2(primaryQty),
        pQty: round2(primaryQty),
        qty: round2(primaryQty),
        qtyAssign: round2(primaryQty),

        total: round2(total),
        totalPrice: round2(total),
        targetAmount: round2(total),
      };
    })
    .filter((row) => row.productId || row.productName);
};

const getProductsTotal = (products = []) => {
  const normalized = normalizeProductTargets(products);

  return {
    products: normalized,

    grandTotal: round2(
      normalized.reduce((sum, row) => sum + safeNum(row.total), 0),
    ),

    totalSecondaryQty: round2(
      normalized.reduce((sum, row) => sum + safeNum(row.secondaryQty), 0),
    ),

    totalPrimaryQty: round2(
      normalized.reduce((sum, row) => sum + safeNum(row.primaryQty), 0),
    ),
  };
};

const makeMonthlyProductsFromYearlyProducts = (yearlyProducts = []) => {
  return normalizeProductTargets(yearlyProducts).map((row) => {
    const secondaryQty = round2(safeNum(row.secondaryQty) / 12);
    const primaryQty = round2(safeNum(row.primaryQty) / 12);
    const total = round2(safeNum(row.total) / 12);

    return {
      ...row,

      secondaryQty,
      sQty: secondaryQty,

      primaryQty,
      pQty: primaryQty,
      qty: primaryQty,
      qtyAssign: primaryQty,

      total,
      totalPrice: total,
      targetAmount: total,
    };
  });
};

const buildMonthlyTargetsFromYearlyProducts = (yearlyProducts = []) => {
  return FY_MONTHS.map((month, index) => {
    const monthProducts = makeMonthlyProductsFromYearlyProducts(yearlyProducts);
    const totals = getProductsTotal(monthProducts);

    return {
      month,
      monthIndex: index,

      targetTotal: totals.grandTotal,
      totalSecondaryQty: totals.totalSecondaryQty,
      totalPrimaryQty: totals.totalPrimaryQty,

      productTargets: totals.products,
      products: totals.products,

      isEdited: false,
      isCustomerEdited: false,
      editedAt: null,
      edited_by: "",
    };
  });
};

const normalizeMonthlyTargets = (
  monthlyTargets = [],
  fallbackProducts = [],
) => {
  const rows = Array.isArray(monthlyTargets) ? monthlyTargets : [];
  const monthMap = new Map();

  rows.forEach((row) => {
    const month = normalizeMonth(row?.month);
    if (!month) return;

    const totals = getProductsTotal(row?.productTargets || row?.products || []);

    monthMap.set(month, {
      ...row,

      month,
      monthIndex: getMonthIndex(month),

      targetTotal:
        safeNum(row?.targetTotal) > 0
          ? round2(row.targetTotal)
          : totals.grandTotal,

      totalSecondaryQty:
        safeNum(row?.totalSecondaryQty) > 0
          ? round2(row.totalSecondaryQty)
          : totals.totalSecondaryQty,

      totalPrimaryQty:
        safeNum(row?.totalPrimaryQty) > 0
          ? round2(row.totalPrimaryQty)
          : totals.totalPrimaryQty,

      productTargets: totals.products,
      products: totals.products,

      isEdited: Boolean(row?.isEdited),
      isCustomerEdited: Boolean(row?.isCustomerEdited),
      editedAt: row?.editedAt || null,
      edited_by: toStr(row?.edited_by || ""),
    });
  });

  const fallbackMonthly =
    buildMonthlyTargetsFromYearlyProducts(fallbackProducts);

  return FY_MONTHS.map((month, index) => {
    return (
      monthMap.get(month) || {
        ...fallbackMonthly[index],
        month,
        monthIndex: index,
      }
    );
  });
};

const ensureMonthlyTargets = (doc) => {
  if (!doc) return [];

  if (Array.isArray(doc.monthlyTargets) && doc.monthlyTargets.length) {
    return normalizeMonthlyTargets(
      doc.monthlyTargets,
      doc.productTargets || doc.products || [],
    );
  }

  return buildMonthlyTargetsFromYearlyProducts(
    doc.productTargets || doc.products || [],
  );
};

const aggregateProductsFromMonthlyTargets = (monthlyTargets = []) => {
  const map = new Map();

  monthlyTargets.forEach((monthRow) => {
    const products = normalizeProductTargets(
      monthRow?.productTargets || monthRow?.products || [],
    );

    products.forEach((product) => {
      const key = toStr(product.productId || product.productName);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          ...product,

          secondaryQty: 0,
          sQty: 0,

          primaryQty: 0,
          pQty: 0,
          qty: 0,
          qtyAssign: 0,

          total: 0,
          totalPrice: 0,
          targetAmount: 0,
        });
      }

      const existing = map.get(key);

      existing.secondaryQty = round2(
        safeNum(existing.secondaryQty) + safeNum(product.secondaryQty),
      );
      existing.sQty = existing.secondaryQty;

      existing.primaryQty = round2(
        safeNum(existing.primaryQty) + safeNum(product.primaryQty),
      );
      existing.pQty = existing.primaryQty;
      existing.qty = existing.primaryQty;
      existing.qtyAssign = existing.primaryQty;

      existing.total = round2(safeNum(existing.total) + safeNum(product.total));
      existing.totalPrice = existing.total;
      existing.targetAmount = existing.total;

      map.set(key, existing);
    });
  });

  return Array.from(map.values());
};

const recalcDocFromMonthlyTargets = (doc) => {
  const monthlyTargets = ensureMonthlyTargets(doc);

  const cleanedMonthlyTargets = monthlyTargets.map((monthRow, index) => {
    const totals = getProductsTotal(
      monthRow?.productTargets || monthRow?.products || [],
    );

    return {
      ...monthRow,

      month: normalizeMonth(monthRow?.month) || FY_MONTHS[index],
      monthIndex: index,

      targetTotal: totals.grandTotal,
      totalSecondaryQty: totals.totalSecondaryQty,
      totalPrimaryQty: totals.totalPrimaryQty,

      productTargets: totals.products,
      products: totals.products,

      isEdited: Boolean(monthRow?.isEdited),
      isCustomerEdited: Boolean(monthRow?.isCustomerEdited),
      editedAt: monthRow?.editedAt || null,
      edited_by: toStr(monthRow?.edited_by || ""),
    };
  });

  const aggregateProducts = aggregateProductsFromMonthlyTargets(
    cleanedMonthlyTargets,
  );
  const yearlyTotals = getProductsTotal(aggregateProducts);

  doc.monthlyTargets = cleanedMonthlyTargets;

  doc.productTargets = yearlyTotals.products;
  doc.products = yearlyTotals.products;

  doc.grandTotal = yearlyTotals.grandTotal;
  doc.targetTotal = yearlyTotals.grandTotal;
  doc.totalSecondaryQty = yearlyTotals.totalSecondaryQty;
  doc.totalPrimaryQty = yearlyTotals.totalPrimaryQty;

  return doc;
};

const normalizeCustomerTargets = (items = []) => {
  const rows = Array.isArray(items) ? items : [];

  return rows.map((row) => {
    const monthlyTargets = normalizeMonthlyTargets(
      row?.monthlyTargets || [],
      [],
    );

    const productTargets = aggregateProductsFromMonthlyTargets(monthlyTargets);
    const totals = getProductsTotal(productTargets);

    return {
      ...row,

      customerId: toStr(
        row?.customerId || row?.customer_id || row?.partyId || "",
      ).trim(),
      customerIds: Array.isArray(row?.customerIds)
        ? row.customerIds.map(toStr)
        : [],

      customerName: toStr(row?.customerName || row?.name || "").trim(),
      salesPersonName: toStr(row?.salesPersonName || "").trim(),

      yearlyTotal: totals.grandTotal,
      targetTotal: totals.grandTotal,
      grandTotal: totals.grandTotal,

      productTargets: totals.products,
      products: totals.products,
      monthlyTargets,

      isEdited: Boolean(row?.isEdited),
      generated: Boolean(row?.generated),
      updatedAt: row?.updatedAt || new Date(),
      updated_by: toStr(row?.updated_by || ""),
    };
  });
};

const normalizeSalesPersonTargets = (items = []) => {
  const rows = Array.isArray(items) ? items : [];

  return rows.map((row) => {
    const monthlyTargets = normalizeMonthlyTargets(
      row?.monthlyTargets || [],
      [],
    );

    const productTargets = aggregateProductsFromMonthlyTargets(monthlyTargets);
    const totals = getProductsTotal(productTargets);

    return {
      ...row,

      salesPersonId: toStr(row?.salesPersonId || "").trim(),
      salesPersonIds: Array.isArray(row?.salesPersonIds)
        ? row.salesPersonIds.map(toStr)
        : [],

      salesPersonName: toStr(row?.salesPersonName || "").trim(),
      customerCount: safeNum(row?.customerCount),
      assignedCustomers: Array.isArray(row?.assignedCustomers)
        ? row.assignedCustomers
        : [],
      assignedCustomerTargetIds: Array.isArray(row?.assignedCustomerTargetIds)
        ? row.assignedCustomerTargetIds.map(toStr)
        : [],

      yearlyTotal: totals.grandTotal,
      targetTotal: totals.grandTotal,
      grandTotal: totals.grandTotal,

      productTargets: totals.products,
      products: totals.products,
      monthlyTargets,

      updatedAt: row?.updatedAt || new Date(),
    };
  });
};

const normalizeSalesManagerTargets = (items = []) => {
  const rows = Array.isArray(items) ? items : [];

  return rows.map((row) => {
    const monthlyTargets = normalizeMonthlyTargets(
      row?.monthlyTargets || [],
      [],
    );

    const productTargets = aggregateProductsFromMonthlyTargets(monthlyTargets);
    const totals = getProductsTotal(productTargets);

    return {
      ...row,

      salesManagerId: toStr(row?.salesManagerId || "").trim(),
      salesManagerIds: Array.isArray(row?.salesManagerIds)
        ? row.salesManagerIds.map(toStr)
        : [],

      salesManagerName: toStr(row?.salesManagerName || "").trim(),
      salesPersonCount: safeNum(row?.salesPersonCount),
      assignedSalesPersons: Array.isArray(row?.assignedSalesPersons)
        ? row.assignedSalesPersons
        : [],
      assignedSalesPersonTargetIds: Array.isArray(
        row?.assignedSalesPersonTargetIds,
      )
        ? row.assignedSalesPersonTargetIds.map(toStr)
        : [],

      yearlyTotal: totals.grandTotal,
      targetTotal: totals.grandTotal,
      grandTotal: totals.grandTotal,

      productTargets: totals.products,
      products: totals.products,
      monthlyTargets,

      updatedAt: row?.updatedAt || new Date(),
    };
  });
};

const buildResponseDoc = (doc) => {
  if (!doc) return null;

  const plain = doc.toObject ? doc.toObject() : doc;
  const monthlyTargets = ensureMonthlyTargets(plain);

  return {
    ...plain,
    monthlyTargets,
    monthlyTarget: round2(safeNum(plain?.grandTotal) / 12),
  };
};

const saveTargetWithoutVersionConflict = async (doc) => {
  try {
    return await doc.save();
  } catch (error) {
    if (error?.name !== "VersionError") {
      throw error;
    }

    const plain = doc.toObject ? doc.toObject() : doc;
    const id = plain._id;

    delete plain._id;
    delete plain.__v;
    delete plain.createdAt;
    delete plain.updatedAt;

    const updated = await YearlyTarget.findOneAndUpdate(
      {
        _id: id,
        status: { $ne: "Deleted" },
      },
      {
        $set: plain,
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updated) {
      throw error;
    }

    return updated;
  }
};

export const createYearlyTarget = async (req, res) => {
  try {
    const {
      database,
      fyear,
      targetName,
      filters = {},
      productTargets,
      products,
      created_by,
    } = req.body || {};

    if (!database || !fyear) {
      return res.status(400).json({
        status: false,
        message: "database and fyear are required",
      });
    }

    const db = toStr(database).trim();
    const fy = toStr(fyear).trim();

    const alreadyExists = await YearlyTarget.findOne({
      database: db,
      fyear: fy,
      status: { $ne: "Deleted" },
    });

    if (alreadyExists) {
      return res.status(409).json({
        status: false,
        code: "TARGET_ALREADY_CREATED",
        message:
          "Yearly target is already created for this financial year. Please edit or update the existing target.",
        data: buildResponseDoc(alreadyExists),
      });
    }

    const normalizedProducts = normalizeProductTargets(
      productTargets || products,
    );

    if (!normalizedProducts.length) {
      return res.status(400).json({
        status: false,
        message: "At least one product target is required",
      });
    }

    const totals = getProductsTotal(normalizedProducts);
    const monthlyTargets = buildMonthlyTargetsFromYearlyProducts(
      totals.products,
    );

    const saved = await YearlyTarget.create({
      database: db,
      fyear: fy,

      targetName: toStr(targetName).trim() || `Yearly Target ${fy}`,

      filters: {
        category: toStr(filters?.category).trim(),
        subCategory: toStr(filters?.subCategory).trim(),
        color: toStr(filters?.color).trim(),
        search: toStr(filters?.search).trim(),
      },

      grandTotal: totals.grandTotal,
      targetTotal: totals.grandTotal,
      totalSecondaryQty: totals.totalSecondaryQty,
      totalPrimaryQty: totals.totalPrimaryQty,

      productTargets: totals.products,
      products: totals.products,
      monthlyTargets,

      customerSplitLocked: false,
      splitBaseGrandTotal: 0,
      splitBaseMonthlyTargets: [],
      splitBaseProductTargets: [],

      customerTargets: [],
      salesPersonTargets: [],
      salesManagerTargets: [],

      created_by: toStr(created_by).trim(),
      status: "Active",
    });

    return res.status(201).json({
      status: true,
      message: "Yearly target created successfully",
      data: buildResponseDoc(saved),
    });
  } catch (error) {
    console.error("createYearlyTarget error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const listYearlyTargets = async (req, res) => {
  try {
    const database = req.params.database || req.query.database;

    if (!database) {
      return res.status(400).json({
        status: false,
        message: "database is required",
      });
    }

    const list = await YearlyTarget.find({
      database,
      status: { $ne: "Deleted" },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Yearly targets fetched successfully",
      data: list.map(buildResponseDoc),
    });
  } catch (error) {
    console.error("listYearlyTargets error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const viewYearlyTarget = async (req, res) => {
  try {
    const { id, database } = req.params;

    if (!id || !database) {
      return res.status(400).json({
        status: false,
        message: "id and database are required",
      });
    }

    const doc = await YearlyTarget.findOne({
      _id: id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Yearly target not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Yearly target fetched successfully",
      data: buildResponseDoc(doc),
    });
  } catch (error) {
    console.error("viewYearlyTarget error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const updateYearlyTarget = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "id is required",
      });
    }

    const existing = await YearlyTarget.findById(id);

    if (!existing || existing.status === "Deleted") {
      return res.status(404).json({
        status: false,
        message: "Yearly target not found",
      });
    }

    const {
      database,
      fyear,
      targetName,
      filters = {},
      productTargets,
      products,
      monthlyTargets,
      customerTargets,
      salesPersonTargets,
      salesManagerTargets,
      customerSplitLocked,
      splitBaseGrandTotal,
      splitBaseMonthlyTargets,
      splitBaseProductTargets,
      updated_by,
      created_by,
      status,
    } = req.body || {};

    const incomingDb =
      typeof database !== "undefined"
        ? toStr(database).trim()
        : existing.database;

    const incomingFy =
      typeof fyear !== "undefined" ? toStr(fyear).trim() : existing.fyear;

    if (incomingDb !== existing.database || incomingFy !== existing.fyear) {
      const duplicate = await YearlyTarget.findOne({
        _id: { $ne: existing._id },
        database: incomingDb,
        fyear: incomingFy,
        status: { $ne: "Deleted" },
      });

      if (duplicate) {
        return res.status(409).json({
          status: false,
          code: "TARGET_ALREADY_CREATED",
          message:
            "Another yearly target already exists for this financial year. Please edit that target.",
          data: buildResponseDoc(duplicate),
        });
      }
    }

    existing.database = incomingDb;
    existing.fyear = incomingFy;

    if (typeof targetName !== "undefined") {
      existing.targetName =
        toStr(targetName).trim() || `Yearly Target ${existing.fyear}`;
    }

    if (typeof filters !== "undefined") {
      existing.filters = {
        category: toStr(filters?.category).trim(),
        subCategory: toStr(filters?.subCategory).trim(),
        color: toStr(filters?.color).trim(),
        search: toStr(filters?.search).trim(),
      };
    }

    if (typeof customerSplitLocked !== "undefined") {
      existing.customerSplitLocked = Boolean(customerSplitLocked);
    }

    if (typeof splitBaseGrandTotal !== "undefined") {
      existing.splitBaseGrandTotal = round2(splitBaseGrandTotal);
    }

    if (Array.isArray(splitBaseMonthlyTargets)) {
      existing.splitBaseMonthlyTargets = normalizeMonthlyTargets(
        splitBaseMonthlyTargets,
        [],
      );
    }

    if (Array.isArray(splitBaseProductTargets)) {
      existing.splitBaseProductTargets = normalizeProductTargets(
        splitBaseProductTargets,
      );
    }

    if (Array.isArray(customerTargets)) {
      existing.customerTargets = normalizeCustomerTargets(customerTargets);
    }

    if (Array.isArray(salesPersonTargets)) {
      existing.salesPersonTargets =
        normalizeSalesPersonTargets(salesPersonTargets);
    }

    if (Array.isArray(salesManagerTargets)) {
      existing.salesManagerTargets =
        normalizeSalesManagerTargets(salesManagerTargets);
    }

    const hasIncomingMonthlyTargets = Array.isArray(monthlyTargets);
    const hasIncomingHierarchy =
      Array.isArray(customerTargets) ||
      Array.isArray(salesPersonTargets) ||
      Array.isArray(salesManagerTargets);

    if (hasIncomingMonthlyTargets) {
      existing.monthlyTargets = normalizeMonthlyTargets(monthlyTargets, []);
      recalcDocFromMonthlyTargets(existing);
    } else if (!hasIncomingHierarchy) {
      const incomingProducts = productTargets || products;

      if (Array.isArray(incomingProducts)) {
        const totals = getProductsTotal(incomingProducts);

        if (!totals.products.length) {
          return res.status(400).json({
            status: false,
            message: "At least one product target is required",
          });
        }

        existing.productTargets = totals.products;
        existing.products = totals.products;

        existing.grandTotal = totals.grandTotal;
        existing.targetTotal = totals.grandTotal;
        existing.totalSecondaryQty = totals.totalSecondaryQty;
        existing.totalPrimaryQty = totals.totalPrimaryQty;

        existing.monthlyTargets = buildMonthlyTargetsFromYearlyProducts(
          totals.products,
        );

        // Full yearly edit means hierarchy split must be manually saved again.
        existing.customerSplitLocked = false;
        existing.customerTargets = [];
        existing.salesPersonTargets = [];
        existing.salesManagerTargets = [];
        existing.splitBaseGrandTotal = 0;
        existing.splitBaseMonthlyTargets = [];
        existing.splitBaseProductTargets = [];
      }
    } else if (Array.isArray(productTargets) || Array.isArray(products)) {
      // Hierarchy pages send productTargets/products already recalculated.
      // Do NOT regenerate monthlyTargets here.
      const incomingProducts = productTargets || products;
      const totals = getProductsTotal(incomingProducts);

      existing.productTargets = totals.products;
      existing.products = totals.products;
      existing.grandTotal = totals.grandTotal;
      existing.targetTotal = totals.grandTotal;
      existing.totalSecondaryQty = totals.totalSecondaryQty;
      existing.totalPrimaryQty = totals.totalPrimaryQty;
    }

    if (typeof created_by !== "undefined") {
      existing.created_by = toStr(created_by).trim();
    }

    if (typeof updated_by !== "undefined") {
      existing.updated_by = toStr(updated_by).trim();
    }

    if (["Active", "Deactive", "Deleted"].includes(status)) {
      existing.status = status;
    }

    const saved = await saveTargetWithoutVersionConflict(existing);

    return res.status(200).json({
      status: true,
      message: "Yearly target updated successfully",
      data: buildResponseDoc(saved),
    });
  } catch (error) {
    console.error("updateYearlyTarget error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const updateYearlyTargetMonth = async (req, res) => {
  try {
    const { id } = req.params;

    const { database, month, productTargets, products, updated_by, edited_by } =
      req.body || {};

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "id is required",
      });
    }

    const targetMonth = normalizeMonth(month);

    if (!targetMonth) {
      return res.status(400).json({
        status: false,
        message: "Valid month is required",
      });
    }

    const selectedMonthIndex = getMonthIndex(targetMonth);

    if (selectedMonthIndex < 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid financial year month",
      });
    }

    const query = {
      _id: id,
      status: { $ne: "Deleted" },
    };

    if (database) query.database = database;

    const existing = await YearlyTarget.findOne(query);

    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Yearly target not found",
      });
    }

    if (existing.customerSplitLocked || existing.customerTargets?.length > 0) {
      return res.status(400).json({
        status: false,
        message:
          "Customer split is locked. Edit target from Customer Target page, not direct yearly month edit.",
      });
    }

    const isMonthCompletedForFY = (fyear, monthIndex) => {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentCalendarMonth = currentDate.getMonth();

      const currentFYStart =
        currentCalendarMonth >= 3 ? currentYear : currentYear - 1;

      const targetFYStart = Number(String(fyear || "").split("-")[0]);

      if (!Number.isFinite(targetFYStart)) return true;

      const currentFYMonthName = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][currentCalendarMonth];

      const currentFYMonthIndex = FY_MONTHS.indexOf(currentFYMonthName);

      if (targetFYStart < currentFYStart) return true;
      if (targetFYStart > currentFYStart) return false;

      return monthIndex < currentFYMonthIndex;
    };

    if (isMonthCompletedForFY(existing.fyear, selectedMonthIndex)) {
      return res.status(400).json({
        status: false,
        message: "Completed month target cannot be edited",
      });
    }

    const normalizedProducts = normalizeProductTargets(
      productTargets || products,
    );

    if (!normalizedProducts.length) {
      return res.status(400).json({
        status: false,
        message: "At least one product target is required for month update",
      });
    }

    const existingMonthlyTargets = ensureMonthlyTargets(existing);

    const editedBy = toStr(edited_by || updated_by || "").trim();
    const editedAt = new Date();

    const updatedMonthlyTargets = existingMonthlyTargets.map(
      (monthRow, index) => {
        const monthName = normalizeMonth(monthRow?.month) || FY_MONTHS[index];

        const oldTotals = getProductsTotal(
          monthRow?.productTargets || monthRow?.products || [],
        );

        const completed = isMonthCompletedForFY(existing.fyear, index);

        if (completed || index < selectedMonthIndex) {
          return {
            month: monthName,
            monthIndex: index,

            targetTotal: oldTotals.grandTotal,
            totalSecondaryQty: oldTotals.totalSecondaryQty,
            totalPrimaryQty: oldTotals.totalPrimaryQty,

            productTargets: oldTotals.products,
            products: oldTotals.products,

            isEdited: Boolean(monthRow?.isEdited),
            isCustomerEdited: Boolean(monthRow?.isCustomerEdited),
            editedAt: monthRow?.editedAt || null,
            edited_by: toStr(monthRow?.edited_by || ""),
          };
        }

        const newTotals = getProductsTotal(
          normalizedProducts.map((product) => ({ ...product })),
        );

        return {
          month: monthName,
          monthIndex: index,

          targetTotal: newTotals.grandTotal,
          totalSecondaryQty: newTotals.totalSecondaryQty,
          totalPrimaryQty: newTotals.totalPrimaryQty,

          productTargets: newTotals.products,
          products: newTotals.products,

          isEdited: true,
          isCustomerEdited: false,
          editedAt,
          edited_by: editedBy,
        };
      },
    );

    existing.monthlyTargets = updatedMonthlyTargets;
    existing.updated_by = editedBy || existing.updated_by || "";

    recalcDocFromMonthlyTargets(existing);

    const saved = await saveTargetWithoutVersionConflict(existing);

    return res.status(200).json({
      status: true,
      message: `${targetMonth} target updated successfully and applied to all editable upcoming months`,
      data: buildResponseDoc(saved),
    });
  } catch (error) {
    console.error("updateYearlyTargetMonth error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const deleteYearlyTarget = async (req, res) => {
  try {
    const { id, database } = req.params;

    if (!id || !database) {
      return res.status(400).json({
        status: false,
        message: "id and database are required",
      });
    }

    const doc = await YearlyTarget.findOne({
      _id: id,
      database,
      status: { $ne: "Deleted" },
    });

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Yearly target not found",
      });
    }

    await YearlyTarget.findOneAndUpdate(
      {
        _id: id,
        database,
        status: { $ne: "Deleted" },
      },
      {
        $set: {
          status: "Deleted",
        },
      },
      {
        new: true,
      },
    );

    return res.status(200).json({
      status: true,
      message: "Yearly target deleted successfully",
    });
  } catch (error) {
    console.error("deleteYearlyTarget error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
