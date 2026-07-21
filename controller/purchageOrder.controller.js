import moment from "moment";
import { ClosingStock } from "../model/closingStock.model.js";
import { Ledger } from "../model/ledger.model.js";
import { Product } from "../model/product.model.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
import { User } from "../model/user.model.js";
import { Warehouse } from "../model/warehouse.model.js";
import { addProductInWarehouse3 } from "./product.controller.js";
import { Receipt } from "../model/receipt.model.js";
import { CustomerGroup } from "../model/customerGroup.model.js";
import { ledgerPartyForCredit } from "../service/ledger.js";
import { Stock } from "../model/stock.js";
import { Customer } from "../model/customer.model.js";

// Put these helpers above the purchaseOrder controller in the same controller file.

const normalizePurchaseOrderNumber = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  // Numeric PO numbers are always stored as 001, 002, 003...
  if (/^\d+$/.test(text)) {
    return String(Number(text)).padStart(3, "0");
  }

  // Custom PO formats are kept as entered.
  return text;
};

const extractPurchaseOrderSequence = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const parsed = Number(text);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const match = text.match(/(\d+)(?!.*\d)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getPurchaseOrderNumberValues = (order = {}) =>
  [
    order?.poNumber,
    order?.purchaseOrderNo,
    order?.PONumber,
    order?.orderNumber,
    order?.orderNo,
    order?.invoice,
    order?.invoiceId,
  ].filter((value) => value !== undefined && value !== null && value !== "");

const getNextPurchaseOrderNumber = (orders = []) => {
  const sequences = (Array.isArray(orders) ? orders : [])
    .flatMap((order) => getPurchaseOrderNumberValues(order))
    .map(extractPurchaseOrderSequence)
    .filter((value) => Number.isInteger(value) && value > 0);

  const nextSequence = sequences.length ? Math.max(...sequences) + 1 : 1;
  return String(nextSequence).padStart(3, "0");
};

const isPurchaseOrderNumberUsed = (orders = [], requestedNumber = "") => {
  const requestedText = normalizePurchaseOrderNumber(requestedNumber);
  const requestedSequence = extractPurchaseOrderSequence(requestedText);

  if (!requestedText) return false;

  return (Array.isArray(orders) ? orders : []).some((order) =>
    getPurchaseOrderNumberValues(order).some((storedValue) => {
      const storedText = normalizePurchaseOrderNumber(storedValue);
      const storedSequence = extractPurchaseOrderSequence(storedText);

      return (
        storedText.toLowerCase() === requestedText.toLowerCase() ||
        (requestedSequence !== null &&
          storedSequence !== null &&
          storedSequence === requestedSequence)
      );
    }),
  );
};

export const purchaseOrder = async (req, res, next) => {
  try {
    const orderItems = Array.isArray(req.body?.orderItems)
      ? req.body.orderItems
      : [];

    if (!orderItems.length) {
      return res.status(400).json({
        message: "At least one product is required",
        status: false,
      });
    }

    const user = await User.findById(req.body.userId);

    if (!user) {
      return res.status(401).json({
        message: "No user found",
        status: false,
      });
    }

    // Keep your existing product checks.
    for (const orderItem of orderItems) {
      const product = await Product.findById(orderItem.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product with ID ${orderItem.productId} not found`,
          status: false,
        });
      }
    }

    // Purchase orders belong to the financial-year database sent by frontend.
    const selectedDatabase = String(
      req.body?.database || user?.database || "",
    ).trim();

    if (!selectedDatabase) {
      return res.status(400).json({
        message: "Database is required",
        status: false,
      });
    }

    const existingOrders = await PurchaseOrder.find({
      database: selectedDatabase,
    })
      .select(
        "poNumber purchaseOrderNo PONumber orderNumber orderNo invoice invoiceId",
      )
      .lean();

    // The frontend sends the same number in all four fields.
    const requestedNumber = normalizePurchaseOrderNumber(
      req.body?.poNumber ??
        req.body?.purchaseOrderNo ??
        req.body?.orderNumber ??
        req.body?.invoice,
    );

    const nextPoNumber = getNextPurchaseOrderNumber(existingOrders);

    if (!requestedNumber) {
      return res.status(400).json({
        message: `PO number is required. The next PO number is ${nextPoNumber}.`,
        nextPoNumber,
        status: false,
      });
    }

    // IMPORTANT: never silently replace the number shown on the page.
    // If it is already used, tell the frontend the next number and stop.
    if (isPurchaseOrderNumberUsed(existingOrders, requestedNumber)) {
      return res.status(409).json({
        message: `PO number ${requestedNumber} is already used. The next PO number is ${nextPoNumber}. Please submit again.`,
        nextPoNumber,
        status: false,
      });
    }

    // Save the exact same visible number in every legacy/current field.
    const payload = {
      ...req.body,
      userId: user._id,
      database: selectedDatabase,
      invoice: requestedNumber,
      poNumber: requestedNumber,
      purchaseOrderNo: requestedNumber,
      orderNumber: requestedNumber,
    };

    const order = await PurchaseOrder.create(payload);

    return res.status(200).json({
      message: "Purchase Order Created Successfully",
      orderDetail: order,
      poNumber: requestedNumber,
      purchaseOrderNo: requestedNumber,
      invoice: requestedNumber,
      status: true,
    });
  } catch (err) {
    // A compound unique index is strongly recommended:
    // purchaseOrderSchema.index(
    //   { database: 1, poNumber: 1 },
    //   {
    //     unique: true,
    //     partialFilterExpression: { poNumber: { $type: "string" } },
    //   },
    // );
    if (err?.code === 11000) {
      try {
        const selectedDatabase = String(req.body?.database || "").trim();
        const existingOrders = await PurchaseOrder.find({
          database: selectedDatabase,
        })
          .select(
            "poNumber purchaseOrderNo PONumber orderNumber orderNo invoice invoiceId",
          )
          .lean();

        const nextPoNumber = getNextPurchaseOrderNumber(existingOrders);

        return res.status(409).json({
          message: `PO number conflict. The next PO number is ${nextPoNumber}. Please submit again.`,
          nextPoNumber,
          status: false,
        });
      } catch (numberError) {
        console.error("Unable to resolve next PO number:", numberError);
      }

      return res.status(409).json({
        message: "PO number conflict. Please reload and submit again.",
        status: false,
      });
    }

    console.error("purchaseOrder error:", err);

    return res.status(500).json({
      message: err?.message || "Unable to create purchase order",
      status: false,
    });
  }
};

const normalizeProductPartyHistory = (product) => {
  const rawValue =
    typeof product?.$__getValue === "function"
      ? product.$__getValue("partyId")
      : product?.partyId;

  const source = Array.isArray(rawValue)
    ? rawValue
    : rawValue
      ? [rawValue]
      : [];

  const fallbackDate = product?.purchaseDate || new Date();

  return source
    .map((entry) => {
      if (!entry) return null;

      // Old format: partyId: "64..." or partyId: ObjectId("64...")
      if (
        typeof entry === "string" ||
        typeof entry?.toHexString === "function"
      ) {
        return {
          partyId: entry,
          purchaseDate: fallbackDate,
        };
      }

      // Current embedded format:
      // { partyId: ObjectId/string/populated customer, purchaseDate: Date }
      const embeddedPartyId =
        entry?.partyId?._id || entry?.partyId?.$oid || entry?.partyId;

      if (!embeddedPartyId) return null;

      return {
        partyId: embeddedPartyId,
        purchaseDate: entry?.purchaseDate || fallbackDate,
      };
    })
    .filter(Boolean);
};

export const purchaseInvoiceOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;

    if (!orderId) {
      return res.status(400).json({
        message: "Purchase order ID is required",
        status: false,
      });
    }

    /*
      IMPORTANT:
      Find the existing purchase order.

      Do not use PurchaseOrder.create() here because the purchase order
      was already created when its status was pending.
    */
    const existingOrder = await PurchaseOrder.findById(orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Purchase order not found",
        status: false,
      });
    }

    /*
      Prevent stock, ledger and party history from being added twice when
      the completion request is accidentally called more than once.
    */
    if (
      String(existingOrder.status || "")
        .trim()
        .toLowerCase() === "completed"
    ) {
      return res.status(200).json({
        message: "Purchase order is already completed",
        orderDetail: existingOrder,
        alreadyCompleted: true,
        status: true,
      });
    }

    let groupDiscount = 0;

    const orderItems = Array.isArray(req.body?.orderItems)
      ? req.body.orderItems
      : [];

    if (!orderItems.length) {
      return res.status(400).json({
        message: "At least one product is required",
        status: false,
      });
    }

    const user = await User.findById(req.body.userId);

    if (!user) {
      return res.status(401).json({
        message: "No user found",
        status: false,
      });
    }

    const party = await Customer.findById(req.body.partyId);

    if (!party) {
      return res.status(404).json({
        message: "Party not found",
        status: false,
      });
    }

    const currentDate = new Date();
    const purchaseDate = new Date(req.body.date || currentDate);

    if (Number.isNaN(purchaseDate.getTime())) {
      return res.status(400).json({
        message: "Invalid purchase order date",
        status: false,
      });
    }

    if (purchaseDate > currentDate) {
      return res.status(400).json({
        message: "Cannot complete a purchase order for a future date",
        status: false,
      });
    }

    const fyMonth = purchaseDate.getMonth() + 1;
    const fyYear = purchaseDate.getFullYear();
    const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;

    const normalizedBody = {
      ...req.body,

      userId: user._id,
      partyId: party._id,

      financialYear:
        req.body.financialYear ||
        `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,

      discountDetails: Array.isArray(req.body.discountDetails)
        ? req.body.discountDetails
        : [],

      ChargesCgst: Number(req.body.ChargesCgst || 0),
      ChargesSgst: Number(req.body.ChargesSgst || 0),
      ChargesIgst: Number(req.body.ChargesIgst || 0),

      igstTaxType:
        typeof req.body.igstTaxType === "boolean"
          ? req.body.igstTaxType
          : Boolean(Number(req.body.igstTaxType)),

      amount: Number(req.body.amount || 0),
      roundOff: Number(req.body.roundOff || 0),
      sgstTotal: Number(req.body.sgstTotal || 0),
      cgstTotal: Number(req.body.cgstTotal || 0),
      igstTotal: Number(req.body.igstTotal || 0),
      grandTotal: Number(req.body.grandTotal || 0),

      hsnSummary:
        req.body.hsnSummary && typeof req.body.hsnSummary === "object"
          ? req.body.hsnSummary
          : null,

      gstDetails: Array.isArray(req.body.gstDetails) ? req.body.gstDetails : [],

      orderItems,

      // This same existing order will become completed.
      status: "completed",
    };

    /*
      Update product quantity, warehouse stock, purchase rate and party
      purchase history only once.
    */
    for (const orderItem of orderItems) {
      const product = await Product.findById(orderItem.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product with ID ${orderItem.productId} not found`,
          status: false,
        });
      }

      const groups = await CustomerGroup.find({
        database: product.database,
        status: "Active",
      });

      if (groups.length > 0) {
        const maxDiscountGroup = groups.reduce((maximum, current) =>
          Number(current?.discount || 0) > Number(maximum?.discount || 0)
            ? current
            : maximum,
        );

        groupDiscount = Number(maxDiscountGroup?.discount || 0);
      } else {
        groupDiscount = 0;
      }

      const itemPrice = Number(
        orderItem.price ?? orderItem.basicPrice ?? orderItem.purchaseRate ?? 0,
      );

      const landedCost = Number(
        orderItem.landedCost ?? orderItem.price ?? orderItem.basicPrice ?? 0,
      );

      if (currentDate.toDateString() === purchaseDate.toDateString()) {
        product.Purchase_Rate = itemPrice;
      } else {
        product.Purchase_Rate = Math.max(
          Number(product.Purchase_Rate || 0),
          landedCost,
        );
      }

      product.landedCost = landedCost;

      const profitPercentage = Number(product.ProfitPercentage || 0);

      const gstRate = Number(product.GSTRate || 0);

      if (profitPercentage === 0) {
        product.SalesRate = Number(product.Purchase_Rate || 0) * 1.03;
      } else {
        product.SalesRate =
          (Number(product.Purchase_Rate || 0) * (100 + profitPercentage)) / 100;
      }

      product.Product_MRP =
        Number(product.SalesRate || 0) *
        (1 + gstRate / 100) *
        (1 + groupDiscount / 100);

      product.purchaseDate = purchaseDate;
      product.purchaseStatus = true;

      product.qty = Number(product.qty || 0) + Number(orderItem.qty || 0);

      const normalizedPartyHistory = normalizeProductPartyHistory(product);

      normalizedPartyHistory.push({
        partyId: party._id,
        purchaseDate,
      });

      product.set("partyId", normalizedPartyHistory);

      product.markModified("partyId");

      await addProductInWarehouse3(
        product,
        product.warehouse,
        orderItem,
        normalizedBody.date,
      );

      await product.save();
    }

    /*
      Update the original pending purchase order.

      This is the main duplicate fix.
    */
    const protectedFields = {
      _id: existingOrder._id,
      createdAt: existingOrder.createdAt,
    };

    Object.assign(existingOrder, normalizedBody);

    existingOrder._id = protectedFields._id;

    if (protectedFields.createdAt) {
      existingOrder.createdAt = protectedFields.createdAt;
    }

    existingOrder.status = "completed";

    const completedOrder = await existingOrder.save();

    /*
      Do not create the same ledger twice.
    */
    const existingLedger = await Ledger.findOne({
      orderId: completedOrder._id,
      particular: "PurchaseInvoice",
    });

    if (existingLedger) {
      existingLedger.partyId = party._id;
      existingLedger.date = completedOrder.date;
      existingLedger.credit = Number(completedOrder.grandTotal || 0);

      await existingLedger.save();
    } else {
      await ledgerPartyForCredit(completedOrder, "PurchaseInvoice");
    }

    return res.status(200).json({
      message: "Purchase order completed successfully",
      orderDetail: completedOrder,
      status: true,
    });
  } catch (err) {
    console.error("PURCHASE INVOICE ORDER ERROR:", err);

    return res.status(500).json({
      message: err?.message || "Internal Server Error",
      error: "Internal Server Error",
      status: false,
    });
  }
};
export const createCompletedPurchaseOrder = async (req, res, next) => {
  try {
    const orderItems = Array.isArray(req.body?.orderItems)
      ? req.body.orderItems
      : [];

    if (!orderItems.length) {
      return res.status(400).json({
        message: "At least one product is required",
        status: false,
      });
    }

    const user = await User.findById(req.body.userId);

    if (!user) {
      return res.status(401).json({
        message: "No user found",
        status: false,
      });
    }

    const party = await Customer.findById(req.body.partyId);

    if (!party) {
      return res.status(404).json({
        message: "Party not found",
        status: false,
      });
    }

    const database = String(req.body.database || user.database || "").trim();

    if (!database) {
      return res.status(400).json({
        message: "Database is required",
        status: false,
      });
    }

    const currentDate = new Date();
    const purchaseDate = new Date(req.body.date || currentDate);

    if (Number.isNaN(purchaseDate.getTime())) {
      return res.status(400).json({
        message: "Invalid purchase order date",
        status: false,
      });
    }

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (purchaseDate > endOfToday) {
      return res.status(400).json({
        message: "Cannot create a purchase order for a future date",
        status: false,
      });
    }

    const purchaseOrderNumber = String(
      req.body.poNumber ||
        req.body.purchaseOrderNo ||
        req.body.orderNumber ||
        req.body.invoice ||
        "",
    ).trim();

    if (!purchaseOrderNumber) {
      return res.status(400).json({
        message: "Purchase order number is required",
        status: false,
      });
    }

    const duplicateOrder = await PurchaseOrder.findOne({
      database,
      $or: [
        { poNumber: purchaseOrderNumber },
        { purchaseOrderNo: purchaseOrderNumber },
        { orderNumber: purchaseOrderNumber },
        { invoice: purchaseOrderNumber },
      ],
    }).lean();

    if (duplicateOrder) {
      return res.status(409).json({
        message: `Purchase order ${purchaseOrderNumber} already exists`,
        orderDetail: duplicateOrder,
        duplicate: true,
        status: false,
      });
    }

    /* =====================================================
       VALIDATE ORDER ITEMS

       IMPORTANT:
       Do NOT store Product mongoose documents here.
       The same product can appear multiple times in the invoice.
    ===================================================== */

    const checkedProductIds = new Set();

    for (const orderItem of orderItems) {
      if (!orderItem?.productId) {
        return res.status(400).json({
          message: "Product ID is required",
          status: false,
        });
      }

      const quantity = Number(orderItem.qty || 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: `Invalid quantity for product ${orderItem.productId}`,
          status: false,
        });
      }

      /*
       * Only check existence once for duplicate products.
       *
       * Example:
       * Product A - Qty 10 - Price 100
       * Product A - Qty 20 - Price 90
       *
       * Product A only needs one existence check here.
       */
      const productId = String(orderItem.productId);

      if (!checkedProductIds.has(productId)) {
        const productExists = await Product.exists({
          _id: orderItem.productId,
        });

        if (!productExists) {
          return res.status(404).json({
            message: `Product with ID ${orderItem.productId} not found`,
            status: false,
          });
        }

        checkedProductIds.add(productId);
      }
    }

    /* =====================================================
       FINANCIAL YEAR
    ===================================================== */

    const fyMonth = purchaseDate.getMonth() + 1;
    const fyYear = purchaseDate.getFullYear();
    const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;

    const financialYear =
      req.body.financialYear ||
      `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

    /* =====================================================
       NORMALIZED PURCHASE ORDER DATA

       Keep orderItems exactly as separate rows.
       Same product with different prices/qty will NOT be merged.
    ===================================================== */

    const normalizedBody = {
      ...req.body,

      userId: user._id,
      partyId: party._id,

      database,
      financialYear,

      invoice: purchaseOrderNumber,
      poNumber: purchaseOrderNumber,
      purchaseOrderNo: purchaseOrderNumber,
      orderNumber: purchaseOrderNumber,

      discountDetails: Array.isArray(req.body.discountDetails)
        ? req.body.discountDetails
        : [],

      ChargesCgst: Number(req.body.ChargesCgst || 0),
      ChargesSgst: Number(req.body.ChargesSgst || 0),
      ChargesIgst: Number(req.body.ChargesIgst || 0),

      igstTaxType:
        typeof req.body.igstTaxType === "boolean"
          ? req.body.igstTaxType
          : Boolean(Number(req.body.igstTaxType)),

      amount: Number(req.body.amount || 0),
      roundOff: Number(req.body.roundOff || 0),
      sgstTotal: Number(req.body.sgstTotal || 0),
      cgstTotal: Number(req.body.cgstTotal || 0),
      igstTotal: Number(req.body.igstTotal || 0),
      grandTotal: Number(req.body.grandTotal || 0),

      hsnSummary:
        req.body.hsnSummary && typeof req.body.hsnSummary === "object"
          ? req.body.hsnSummary
          : null,

      gstDetails: Array.isArray(req.body.gstDetails) ? req.body.gstDetails : [],

      /*
       * IMPORTANT:
       * Keep duplicate products as separate invoice rows.
       */
      orderItems,

      status: "completed",
    };

    /* =====================================================
       PROCESS PRODUCTS

       IMPORTANT FIX:
       Fetch the Product FRESH for every order item.

       If Product A appears twice:
       Row 1 -> fetch A -> update -> save
       Row 2 -> fetch A again with latest DB state -> update -> save

       This prevents stale mongoose document/version errors.
    ===================================================== */

    for (const orderItem of orderItems) {
      /*
       * THIS IS THE MAIN FIX.
       *
       * Fetch a fresh copy every iteration instead of using
       * productDocuments created before any saves happened.
       */
      const product = await Product.findById(orderItem.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product with ID ${orderItem.productId} not found`,
          status: false,
        });
      }

      const quantity = Number(orderItem.qty || 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: `Invalid quantity for product ${
            product.Product_Title || orderItem.productId
          }`,
          status: false,
        });
      }

      let groupDiscount = 0;

      const customerGroups = await CustomerGroup.find({
        database: product.database,
        status: "Active",
      });

      if (customerGroups.length > 0) {
        const maximumDiscountGroup = customerGroups.reduce(
          (maximum, current) =>
            Number(current?.discount || 0) > Number(maximum?.discount || 0)
              ? current
              : maximum,
        );

        groupDiscount = Number(maximumDiscountGroup?.discount || 0);
      }

      const itemPrice = Number(
        orderItem.price ?? orderItem.basicPrice ?? orderItem.purchaseRate ?? 0,
      );

      const landedCost = Number(
        orderItem.landedCost ?? orderItem.price ?? orderItem.basicPrice ?? 0,
      );

      /* ---------------- Purchase Rate ---------------- */

      if (currentDate.toDateString() === purchaseDate.toDateString()) {
        product.Purchase_Rate = itemPrice;
      } else {
        product.Purchase_Rate = Math.max(
          Number(product.Purchase_Rate || 0),
          landedCost,
        );
      }

      product.landedCost = landedCost;

      /* ---------------- Sales Rate ---------------- */

      const profitPercentage = Number(product.ProfitPercentage || 0);

      const gstRate = Number(product.GSTRate || 0);

      if (profitPercentage === 0) {
        product.SalesRate = Number(product.Purchase_Rate || 0) * 1.03;
      } else {
        product.SalesRate =
          (Number(product.Purchase_Rate || 0) * (100 + profitPercentage)) / 100;
      }

      product.Product_MRP =
        Number(product.SalesRate || 0) *
        (1 + gstRate / 100) *
        (1 + groupDiscount / 100);

      product.purchaseDate = purchaseDate;
      product.purchaseStatus = true;

      /* ==================================================
         QTY

         Because we fetched a FRESH product above,
         duplicate rows correctly accumulate quantity.

         Example:
         Current qty = 100

         Row 1: qty 10
         Product saved = 110

         Row 2: fresh Product fetched = 110
         qty 20 added
         Product saved = 130
      ================================================== */

      product.qty = Number(product.qty || 0) + Number(orderItem.qty || 0);

      /* ---------------- Party History ---------------- */

      const normalizedPartyHistory = normalizeProductPartyHistory(product);

      normalizedPartyHistory.push({
        partyId: party._id,
        purchaseDate,
      });

      product.set("partyId", normalizedPartyHistory);

      product.markModified("partyId");

      /* ---------------- Warehouse ---------------- */

      await addProductInWarehouse3(
        product,
        product.warehouse,
        orderItem,
        normalizedBody.date,
      );

      /* ---------------- Save Fresh Product ---------------- */

      await product.save();
    }

    /* =====================================================
       CREATE PURCHASE ORDER

       orderItems still contains both separate rows.
    ===================================================== */

    const completedOrder = await PurchaseOrder.create(normalizedBody);

    await ledgerPartyForCredit(completedOrder, "PurchaseInvoice");

    return res.status(201).json({
      message: "Completed purchase order created successfully",
      orderDetail: completedOrder,
      status: true,
    });
  } catch (err) {
    console.error("CREATE COMPLETED PURCHASE ORDER ERROR:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        message: "This purchase order already exists",
        duplicate: true,
        status: false,
      });
    }

    return res.status(500).json({
      message: err?.message || "Internal Server Error",
      error: "Internal Server Error",
      status: false,
    });
  }
};
export const UpdatePurchaseInvoiceOrder = async (req, res, next) => {
  try {
    const purchase = await PurchaseOrder.findById(req.params.orderId);
    if (!purchase) {
      return res
        .status(401)
        .json({ message: "PurchaseOrder Not Found", status: false });
    } else {
      if (Object.keys(req.body).length === 0) {
        return res
          .status(400)
          .json({ message: "Purchase Order Not Updated", status: false });
      }
      const order = await PurchaseOrder.findByIdAndUpdate(
        req.params.orderId,
        req.body,
        { new: true },
      );
      return order
        ? res.status(200).json({ orderDetail: order, status: true })
        : res
            .status(400)
            .json({ message: "Something Went Wrong", status: false });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const PurchaseOrderDispatch = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findById({ _id: req.params.id });
    if (!order) {
      return res
        .status(401)
        .json({ message: "Purchase Order Not Found", status: false });
    } else {
      for (const orderItem of order.orderItems) {
        for (let item of req.body.DispatchItem) {
          if (item.productId.toString() === orderItem.productId.toString()) {
            orderItem.ReceiveQty = item.ReceiveQty;
            orderItem.DamageQty = item.DamageQty;
            orderItem.status = "Received";
            order.status = "Received";
          }
        }
      }
      for (const orderItem of order.orderItems) {
        if (orderItem.status === "Received") {
          order.status = "Received";
        } else {
          order.status = "pending";
        }
      }
      order.NoOfPackage += req.body.NoOfPackage;
      const updatedOrder = order.save();
      return updatedOrder
        ? res.status(200).json({
            message: "Updated Successfull!",
            orderDetail: updatedOrder,
            status: true,
          })
        : res
            .status(400)
            .json({ message: "Something Went Wrong", status: false });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const purchaseOrderHistoryByOrderId = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const orders = await PurchaseOrder.findById({ _id: orderId })
      .populate({
        path: "userId",
        model: "user",
      })
      .populate({
        path: "orderItems.productId",
        model: "product",
      })
      .populate({ path: "partyId", model: "customer" })
      .exec();
    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the user", status: false });
    }
    return res.status(200).json({ orderHistory: orders, status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err });
  }
};
export const purchaseOrderHistory = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    // const adminDetail = await getUserHierarchyBottomToTop(userId, database)
    // if (!adminDetail.length > 0) {
    //     return res.status(404).json({ error: "Product Not Found", status: false })
    // }
    const purchaseOrder = await PurchaseOrder.find({
      database: database,
      status: { $ne: "Deactive" },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .exec();
    return purchaseOrder
      ? res.status(200).json({ orderHistory: purchaseOrder, status: true })
      : res.json({ message: "Purchase Order Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const updatePurchaseOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, paymentMode } = req.body;
    const order = await PurchaseOrder.findOne({ _id: orderId });
    if (!order) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    if (status || paymentMode) {
      Object.assign(order, {
        status: status || order.status,
        paymentMode: paymentMode || order.paymentMode,
      });
      await order.save();
    }
    return res.status(200).json({ Order: order, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error, status: false });
  }
};
export const updatePurchaseOrder = async (req, res, next) => {
  try {
    let groupDiscount = 0;
    const orderId = req.params.id;
    const updatedFields = req.body;
    if (!orderId || !updatedFields) {
      return res
        .status(400)
        .json({ message: "Invalid input data", status: false });
    }
    const party = await Customer.findById({ _id: updatedFields.partyId });
    if (!party) {
      return res.json({ message: "Party Not Found", status: false });
    }
    const order = await PurchaseOrder.findById({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found", status: false });
    }
    const oldItems = order.orderItems || [];
    const newItems = updatedFields.orderItems || [];
    const oldMap = new Map(
      oldItems.map((item) => [item.productId.toString(), item]),
    );
    const newMap = new Map(
      newItems.map((item) => [item.productId.toString(), item]),
    );

    const removedItems = oldItems.filter(
      (item) => !newMap.has(item.productId.toString()),
    );
    const addedItems = newItems.filter(
      (item) => !oldMap.has(item.productId.toString()),
    );

    const updatedItems = newItems.filter((item) =>
      oldMap.has(item.productId.toString()),
    );

    const isCompleted = order.status === "completed";
    for (const oldItem of removedItems) {
      console.log("oldeItem remove", oldItem);
      const product = await Product.findById({ _id: oldItem.productId });
      if (!product) continue;

      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: product.warehouse.toString(),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty += oldItem.qty;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString(),
          );
          if (whItem) {
            whItem.currentStock += oldItem.qty;
            whItem.totalPrice -= oldItem.totalPrice;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString(),
          );
          if (sItem) {
            sItem.currentStock += oldItem.qty;
            sItem.pQty -= oldItem.qty;
            sItem.pTotal -= oldItem.totalPrice;
            await stock.save();
          }
        }
      } else {
        product.qty += oldItem.qty;
        product.pendingQty -= oldItem.qty;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString(),
          );
          if (whItem) {
            whItem.currentStock += oldItem.qty;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString(),
          );
          if (sItem) {
            // sItem.pendingStock -= oldItem.qty;
            sItem.currentStock += oldItem.qty;
            // sItem.pendingStockTotal -= oldItem.totalPrice;
            await stock.save();
          }
        }
      }

      party.remainingLimit += oldItem.totalPrice;
      await product.save();
    }
    for (const newItem of addedItems) {
      console.log("add newItem", newItem);
      const product = await Product.findById({ _id: newItem.productId });
      if (!product) continue;

      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: product.warehouse.toString(),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty -= newItem.qty;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          if (whItem) {
            whItem.currentStock -= newItem.qty;
            whItem.totalPrice += newItem.totalPrice;
            whItem.transferQty += newItem.qty;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          if (sItem) {
            sItem.currentStock -= newItem.qty;
            sItem.pQty += newItem.qty;
            sItem.pTotal += newItem.totalPrice;
            await stock.save();
          }
        }
      } else {
        product.qty -= newItem.qty;
        product.pendingQty += newItem.qty;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          if (whItem) {
            whItem.currentStock -= newItem.qty;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          if (sItem) {
            // sItem.pendingStock += newItem.qty;
            sItem.currentStock -= newItem.qty;
            // sItem.pendingStockTotal += newItem.totalPrice;
            await stock.save();
          }
        }
      }

      party.remainingLimit -= newItem.totalPrice;
      await product.save();
    }
    for (const newItem of updatedItems) {
      console.log("update same newItem", newItem);

      const oldItem = oldMap.get(newItem.productId.toString());
      // console.log("newItem.qty",newItem.qty,oldItem.qty)
      const qtyChange = newItem.qty - oldItem.qty;
      const priceChange = newItem.totalPrice - oldItem.totalPrice;
      // console.log("qtyChange priceChange",qtyChange,priceChange)
      if (qtyChange === 0 && priceChange === 0) continue;

      const product = await Product.findById({ _id: newItem.productId });
      if (!product) continue;

      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: product.warehouse.toString(),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty -= qtyChange;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          // console.log("whItem",whItem)
          if (whItem) {
            whItem.currentStock -= qtyChange;
            whItem.totalPrice += priceChange;
          }
          await warehouse.save();
          // console.log("whItem",whItem)
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          // console.log("sItem",sItem)
          if (sItem) {
            sItem.currentStock -= qtyChange;
            sItem.pQty += qtyChange;
            sItem.pTotal += priceChange;
            await stock.save();
          }
          // console.log("aftersItem",sItem)
        }
      } else {
        product.qty -= qtyChange;
        product.pendingQty += qtyChange;

        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          if (whItem) {
            whItem.currentStock -= qtyChange;
          }
          await warehouse.save();
        }

        if (stock) {
          // console.log("stock",stock)
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString(),
          );
          // console.log("sitem",sItem)
          if (sItem) {
            sItem.currentStock -= qtyChange;
            // sItem.pendingStock += qtyChange;
            // sItem.pendingStockTotal += priceChange;
            await stock.save();
          }
        }
      }

      party.remainingLimit -= priceChange;
      await product.save();
    }

    const ledger = await Ledger.findOne({
      partyId: updatedFields.partyId,
      date: updatedFields.date,
      particular: "PurchaseInvoice",
    });
    if (ledger) {
      ledger.credit = updatedFields.grandTotal;
      await ledger.save();
    }

    await party.save();

    Object.assign(order, updatedFields);
    const updatedOrder = await order.save();

    return res.status(200).json({ orderDetail: updatedOrder, status: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
export const ProductWisePurchaseReport = async (req, res, next) => {
  try {
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const targetQuery = {
      database: req.params.database,
      status: { $ne: "Deactive" },
    };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    let orders = [];
    const salesOrder = await PurchaseOrder.find(targetQuery).populate({
      path: "orderItems.productId",
      model: "product",
    });
    if (salesOrder.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    for (let order of salesOrder) {
      orders = orders.concat(order.orderItems);
    }
    const uniqueOrdersMap = new Map();
    for (let orderItem of orders) {
      const key = orderItem?.productId?._id.toString() + orderItem.HSN_Code;
      if (uniqueOrdersMap.has(key)) {
        const existingOrder = uniqueOrdersMap.get(key);
        existingOrder.taxableAmount += orderItem.taxableAmount;
        existingOrder.cgstRate += orderItem.cgstRate;
        existingOrder.qty += orderItem.qty;
        existingOrder.Size += orderItem.Size;
        existingOrder.sgstRate += orderItem.sgstRate;
        existingOrder.igstRate += orderItem.igstRate;
        existingOrder.grandTotal += orderItem.grandTotal;
      } else {
        uniqueOrdersMap.set(key, { ...orderItem.toObject() });
      }
    }
    const uniqueOrders = Array.from(uniqueOrdersMap.values());
    return res.status(200).json({ Orders: uniqueOrders, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deletePurchaseOrder = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    if (order.status === "completed") {
      return res
        .status(400)
        .json({ message: "this order not deleted", status: false });
    }
    order.status = "Deactive";
    await order.save();
    return res
      .status(200)
      .json({ message: "delete successfull!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// delete purchaseOrder after status completed
// export const deletedPurchase = async (req, res, next) => {
//     try {
//         const purchase = await PurchaseOrder.findById(req.params.id)
//         if (!purchase) {
//             return res.status(404).json({ message: "PurchaseOrder Not Found", status: false })
//         }
//         for (const orderItem of purchase.orderItems) {
//             const product = await Product.findOne({ _id: orderItem.productId });
//             if (product) {
//                 // const current = new Date(new Date())
//                 // product.purchaseDate = current
//                 // product.partyId = req.body.partyId;
//                 // product.purchaseStatus = true
//                 // product.landedCost = orderItem.landedCost;
//                 product.qty -= orderItem.qty;
//                 // product.pendingQty += orderItem.qty;
//                 const warehouse = { productId: orderItem.productId, currentStock: (orderItem.qty), transferQty: (orderItem.qty), price: orderItem.price, totalPrice: orderItem.totalPrice, gstPercentage: orderItem.gstPercentage, igstTaxType: orderItem.igstTaxType, primaryUnit: orderItem.primaryUnit, secondaryUnit: orderItem.secondaryUnit, secondarySize: orderItem.secondarySize, landedCost: orderItem.landedCost }
//                 await product.save();
//                 await deleteAddProductInWarehouse(warehouse, product.warehouse)
//                 const previousPurchaseOrderss = await PurchaseOrder.findOne({
//                     "orderItems.productId": orderItem.productId,
//                     status: "completed",
//                     createdAt: { $lt: purchase.createdAt }
//                 }).sort({ createdAt: -1 });
//                 await DeleteStockPurchase(orderItem,purchase.date,previousPurchaseOrderss.orderItems)
//                 // await DeleteClosingPurchase(orderItem, product.warehouse)
//             } else {
//                 console.log("Product Id Not Found")
//                 // return res.status(404).json(`Product with ID ${orderItem.productId} not found`);
//             }
//         }
//         purchase.status = "Deactive"
//         await purchase.save()
//         await Ledger.findOneAndDelete({ orderId: req.params.id })
//         return res.status(200).json({ message: "delete successfull!", status: true })
//     }
//     catch (err) {
//         console.log(err)
//         return res.status(500).json({ error: "Internal Server Error", status: false })
//     }
// }
export const deletedPurchase = async (req, res, next) => {
  try {
    const purchase = await PurchaseOrder.findById(req.params.id);
    if (!purchase) {
      return res
        .status(404)
        .json({ message: "PurchaseOrder Not Found", status: false });
    }

    if (!purchase.orderItems || purchase.orderItems.length === 0) {
      return res.status(400).json({
        message: "No order items found in this purchase order",
        status: false,
      });
    }

    for (const orderItem of purchase.orderItems) {
      const product = await Product.findOne({ _id: orderItem.productId });
      if (product) {
        product.qty -= orderItem.qty;
        const warehouse = {
          productId: orderItem.productId,
          currentStock: orderItem.qty,
          transferQty: orderItem.qty,
          price: orderItem.price,
          totalPrice: orderItem.totalPrice,
          gstPercentage: orderItem.gstPercentage,
          igstTaxType: orderItem.igstTaxType,
          primaryUnit: orderItem.primaryUnit,
          secondaryUnit: orderItem.secondaryUnit,
          secondarySize: orderItem.secondarySize,
          landedCost: orderItem.landedCost,
        };
        await product.save();
        await deleteAddProductInWarehouse(warehouse, product.warehouse);

        const previousPurchaseOrders = await PurchaseOrder.find({
          "orderItems.productId": orderItem.productId,
          status: "completed",
          createdAt: { $lt: purchase.createdAt },
        }).sort({ createdAt: -1 });
        if (!previousPurchaseOrders || previousPurchaseOrders.length === 0) {
          orderItem.price = 0;
        } else {
          orderItem.price = previousPurchaseOrders[0].orderItems.find(
            (item) =>
              item.productId.toString() === orderItem.productId.toString(),
          ).price;
        }

        await DeleteStockPurchase(
          orderItem,
          purchase.date,
          previousPurchaseOrders,
        );
      } else {
        console.log("Product Id Not Found");
      }
    }
    if (purchase.status === "completed") {
      const party = await Customer.findById(purchase.partyId);
      party.remainingLimit -= purchase.grandTotal;
      await party.save();
    }
    purchase.status = "Deactive";
    await purchase.save();
    await Ledger.findOneAndDelete({ orderId: req.params.id });

    return res
      .status(200)
      .json({ message: "Deletion successful!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deleteAddProductInWarehouse = async (warehouse, warehouseId) => {
  try {
    const user = await Warehouse.findById(warehouseId);
    if (!user) {
      // return console.log("warehouse not found");
    }
    const sourceProductItem = user.productItems.find(
      (pItem) => pItem.productId.toString() === warehouse.productId.toString(),
    );

    if (sourceProductItem) {
      sourceProductItem.currentStock -= warehouse.transferQty;
      sourceProductItem.totalPrice -= warehouse.totalPrice;
      sourceProductItem.transferQty -= warehouse.transferQty;
      // if (sourceProductItem.currentStock <= 0) {
      //     user.productItems = user.productItems.filter((pItem) => pItem.productId.toString() !== warehouse.productId._id.toString());
      // }
      // console.log("warehouse : " + sourceProductItem)
      user.markModified("productItems");
      await user.save();
    } else {
      console.log("Product item not found in the warehouse");
    }
  } catch (error) {
    console.error(error);
  }
};
export const DeleteClosingPurchase = async (orderItem, warehouse) => {
  try {
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;
    let tax = 0;
    const rate = parseInt(orderItem.gstPercentage) / 2;
    if (orderItem.igstTaxType === false) {
      cgstRate = (orderItem.qty * orderItem.price * rate) / 100;
      sgstRate = (orderItem.qty * orderItem.price * rate) / 100;
      tax = cgstRate + sgstRate;
    } else {
      igstRate =
        (orderItem.qty * orderItem.price * parseInt(orderItem.gstPercentage)) /
        100;
      tax = igstRate;
    }
    const stock = await ClosingStock.findOne({
      warehouseId1: warehouse,
      productId: orderItem.productId,
    });
    if (stock) {
      stock.pQty -= orderItem.qty;
      stock.pBAmount -= orderItem.totalPrice;
      stock.pTaxRate -= tax;
      stock.pTotal -= orderItem.totalPrice + tax;
      // console.log("stock : " + stock)
      await stock.save();
    } else {
      console.log("product item not found in stock");
    }
    return true;
  } catch (err) {
    console.log(err);
  }
};
// For DashBoard
export const CreditorCalculate11 = async (req, res, next) => {
  try {
    let Creditor = {
      totalPurchase: 0,
      totalPaid: 0,
      currentPurchase: 0,
      currentPaid: 0,
      outstanding: 0,
    };
    // const startOfDay = moment().startOf('day').toDate();
    // const endOfDay = moment().endOf('day').toDate();
    const startOfDay = moment().startOf("month").toDate();
    const endOfDay = moment().endOf("month").toDate();
    const purchase = await PurchaseOrder.find({
      database: req.params.database,
      status: "completed",
    }).sort({ sortorder: -1 });
    if (purchase.length === 0) {
      // return res.status(404).json({ message: "Purchase Order Not Found", status: false })
    }
    const purchaseCurrentMonth = await PurchaseOrder.find({
      database: req.params.database,
      status: "completed",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ sortorder: -1 });
    if (purchaseCurrentMonth.length === 0) {
      // return res.status(404).json({ message: "Purchase Order Not Found", status: false })
    }
    const receipt = await Receipt.find({
      database: req.params.database,
      type: "payment",
      status: "Active",
    }).sort({ sortorder: -1 });
    if (receipt.length === 0) {
      // return res.status(404).json({ message: "Purchase Order Not Found", status: false })
    }
    const receipts = await Receipt.find({
      database: req.params.database,
      type: "payment",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: "Active",
    }).sort({ sortorder: -1 });
    if (receipts.length === 0) {
      // return res.status(404).json({ message: "Purchase Order Not Found", status: false })
    }
    purchase.forEach((item) => {
      Creditor.totalPurchase += item.grandTotal;
    });
    purchaseCurrentMonth.forEach((item) => {
      Creditor.currentPurchase += item.grandTotal;
    });
    receipt.forEach((item) => {
      Creditor.totalPaid += item.amount;
    });
    receipts.forEach((item) => {
      Creditor.currentPaid += item.amount;
    });
    Creditor.outstanding = Creditor.totalPurchase - Creditor.totalPaid;
    res.status(200).json({ Creditor, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const CreditorCalculate = async (req, res, next) => {
  try {
    let Creditor = {
      totalPurchase: 0,
      totalPaid: 0,
      currentPurchase: 0,
      currentPaid: 0,
      outstanding: 0,
    };
    // const startOfDay = moment().startOf('day').toDate();
    // const endOfDay = moment().endOf('day').toDate();
    const startOfDay = moment().startOf("month").toDate();
    const endOfDay = moment().endOf("month").toDate();
    // Fetch all necessary data in parallel
    const [purchase, purchaseCurrentMonth, receipt, receipts] =
      await Promise.all([
        PurchaseOrder.find({
          database: req.params.database,
          status: "completed",
        }).sort({ sortorder: -1 }),
        PurchaseOrder.find({
          database: req.params.database,
          status: "completed",
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        }).sort({ sortorder: -1 }),
        Receipt.find({
          database: req.params.database,
          type: "payment",
          status: "Active",
        }).sort({ sortorder: -1 }),
        Receipt.find({
          database: req.params.database,
          type: "payment",
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: "Active",
        }).sort({ sortorder: -1 }),
      ]);

    // Calculate totals
    Creditor.totalPurchase = purchase.reduce(
      (sum, item) => sum + item.grandTotal,
      0,
    );
    Creditor.currentPurchase = purchaseCurrentMonth.reduce(
      (sum, item) => sum + item.grandTotal,
      0,
    );
    Creditor.totalPaid = receipt.reduce((sum, item) => sum + item.amount, 0);
    Creditor.currentPaid = receipts.reduce((sum, item) => sum + item.amount, 0);
    // Creditor.outstanding = Creditor.totalPurchase - Creditor.totalPaid;

    res.status(200).json({ Creditor, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const Purch = async (req, res, next) => {
  try {
    const date = new Date(req.body.date);
    if (isNaN(date))
      return res
        .status(400)
        .json({ message: "Invalid date format", status: false });
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const stock = await Stock.find({
      warehouseId: req.params.id.toString(),
      "productItems.productId": req.body.productId,
      createdAt: { $gte: startOfDay },
    });
    if (stock.length === 0)
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    // console.log("Stock found:", stock);
    // const existingStock = stock.productItems.find((item) => item.productId.toString() === req.body.productId.toString());
    // if (existingStock) {
    //     existingStock.pQty += req.body.orderItem.qty;
    //     existingStock.pRate = req.body.orderItem.price;
    //     existingStock.pBAmount += req.body.orderItem.totalPrice;
    //     existingStock.pTaxRate = stock.GSTRate;
    //     existingStock.pTotal += req.body.orderItem.totalPrice;
    // } else {
    //     console.log("Product not found in stock");
    //     return res.status(404).json({ message: "Product not found in stock", status: false });
    // }
    // await stock.save();
    return res
      .status(200)
      .json({ message: "Stock updated successfully", stock, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// export const DeleteStockPurchase=async(orderItem,date)=>{
// try {
//     const stock=await Stock.findOne({date:date})
//     console.log("stock",stock,"date",date)
//     for(let productItem of stock.productItems){
//         console.log("productItem",productItem)
//         if(productItem.productId.toString()===orderItem.productId){
//             productItem.currentStock-=orderItem.qty
//             productItem.totalPrice-=orderItem.totalPrice
//             productItem.pTotal-=orderItem.totalPrice
//             await stock.save()
//         }
//     }
//     console.log("after stock check",stock.productItems.currentStock)
//     if(stock.productItems.currentStock===0){
// stock.productItems=stock.productItems.filter((item)=>item.productId.toString()!==orderItem.productId)
// await stock.save()
//     }
// } catch (error) {
//     console.log(error)
// }
// }

// export const DeleteStockPurchase = async (orderItem, date,orderData) => {
//     try {
//         console.log("orderdata",orderData,orderData[0].price)
//         if(!orderData){
//             orderData.price=0;
//             orderData[0].price=0
//             console.log(" orderData.price", orderData.price)
//             console.log("  orderData[0].price=0", orderData[0].price)

//         }
//       const stock = await Stock.findOne({ date: date });
//       for (let productItem of stock.productItems) {
//           if (productItem.productId === orderItem.productId.toString()) {
//             //   console.log("productItem", productItem)
//           productItem.currentStock -= orderItem.qty;
//           productItem.pRate=orderData[0].price||0;
//           productItem.price=orderData[0].price||0;
//           productItem.pQty-=orderItem.qty;
//           productItem.totalPrice -= orderItem.totalPrice;
//           productItem.pTotal -= orderItem.totalPrice;
//           await stock.save();
//         }
//       }
//       for (let productItem of stock.productItems) {
//         if (productItem.productId.toString() === orderItem.productId && productItem.currentStock === 0) {
//           stock.productItems = stock.productItems.filter(item => item.productId.toString() !== orderItem.productId);
//           await stock.save();
//           break;
//         }
//       }
//     } catch (error) {
//       console.log(error);
//     }
//   };
export const DeleteStockPurchase = async (orderItem, date, orderData) => {
  try {
    if (!orderData || !orderData[0]) {
      console.log("Previous purchase order not found, setting price to 0.");
      orderItem.price = 0;
      orderData = [{ price: 0 }];
      console.log("orderItem.price", orderItem.price);
    }

    const stock = await Stock.findOne({ date: date });
    if (!stock) {
      console.log("Stock not found for date:", date);
      return;
    }

    for (let productItem of stock.productItems) {
      if (productItem.productId === orderItem.productId.toString()) {
        productItem.currentStock -= orderItem.qty;
        productItem.pRate = orderData[0].price || 0;
        productItem.price = orderData[0].price || 0;
        productItem.pQty -= orderItem.qty;
        productItem.totalPrice -= orderItem.totalPrice;
        productItem.pTotal -= orderItem.totalPrice;
        await stock.save();
        break;
      }
    }
    for (let productItem of stock.productItems) {
      if (
        productItem.productId.toString() === orderItem.productId &&
        productItem.currentStock === 0
      ) {
        stock.productItems = stock.productItems.filter(
          (item) => item.productId.toString() !== orderItem.productId,
        );
        await stock.save();
        break;
      }
    }
  } catch (error) {
    console.log("Error in DeleteStockPurchase:", error);
  }
};
// controller/purchageOrder.controller.js
import mongoose from "mongoose";
import nodemailer from "nodemailer";
// import { PurchaseOrder } from "../models/PurchaseOrder.js";

/* --- helper: safely pick a 24-hex ObjectId out of any incoming string --- */
const pickObjectId = (v) => {
  const s = String(v ?? "").trim();
  if (mongoose.isValidObjectId(s)) return s;
  const m = s.match(/[a-fA-F0-9]{24}/);
  return m && mongoose.isValidObjectId(m[0]) ? m[0] : null;
};

export const sendPurchaseOrderMail = async (req, res) => {
  try {
    // 1) sanitize id (prevents "…[object Object]" cast errors)
    const orderId = pickObjectId(req.params?.id);
    if (!orderId) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid order id." });
    }

    const database = req.body?.database;

    // 2) fetch order
    const order = await PurchaseOrder.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ status: false, message: "Order not found" });
    }

    // Optional safety: ensure the request targets the same database
    if (database && order.database && database !== order.database) {
      return res
        .status(400)
        .json({ status: false, message: "Database mismatch" });
    }

    // 3) resolve recipient email
    // Prefer an explicit field saved on the order (partyEmail / email)
    let toEmail = (order.partyEmail || order.email || "").trim();
    if (!toEmail) {
      return res.status(400).json({
        status: false,
        message: "No email found for this party/order.",
      });
    }

    // 4) build a simple HTML mail (replace with your template if you want)
    const rowsHtml = (order.orderItems || [])
      .map(
        (it, i) => `
          <tr>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:center">${
              i + 1
            }</td>
            <td style="padding:6px;border:1px solid #e5e7eb">
              ${it?.productData?.Product_Title || it?.productName || "-"}
            </td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${Number(
              it?.qty ?? 0,
            )}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${Number(
              it?.price || it?.basicPrice || 0,
            ).toFixed(2)}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${Number(
              it?.taxableAmount || 0,
            ).toFixed(2)}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif">
        <h2>Purchase Order</h2>
        <p>
          <b>PO No:</b> ${order.poNumber || order.invoiceId || "-"}<br/>
          <b>Date:</b> ${new Date(order.date || order.createdAt).toLocaleString(
            "en-IN",
          )}<br/>
          <b>Party:</b> ${order.fullName || "-"}<br/>
          <b>Total:</b> ₹${Number(
            order.grandTotal || order.amount || 0,
          ).toFixed(2)}
        </p>
        <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;width:100%;max-width:760px">
          <thead>
            <tr>
              <th style="padding:6px;border:1px solid #e5e7eb">#</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Item</th>
              <th style="padding:6px;border:1px solid #e5e7eb">Qty</th>
              <th style="padding:6px;border:1px solid #e5e7eb">Rate</th>
              <th style="padding:6px;border:1px solid #e5e7eb">Taxable</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // 5) send the mail
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = port === 465; // true for 465, false for 587/25 etc.
    const user = process.env.EMAIL || process.env.SMTP_USER;
    const pass = process.env.PASS || process.env.SMTP_PASS;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: user,
      to: toEmail,
      subject: `Purchase Order ${
        order.poNumber || order.invoiceId || ""
      }`.trim(),
      html,
    });

    // 6) mark as confirmed + stamp time (saved only if your schema has these fields)
    order.status = "confirmed";
    order.emailSentAt = new Date();
    await order.save();

    return res.status(200).json({ status: true, order });
  } catch (err) {
    console.error("sendPurchaseOrderMail error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Mail failed", error: err?.message });
  }
};
