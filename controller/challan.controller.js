// controllers/challan.controller.js
import { Challan } from "../model/challan.model.js";

/* ========= Helpers ========= */
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

// Round to nearest rupee (0 decimals), 0.5 => up
const roundRupeeHalfUp = (n) => Math.round(toNum(n));

const genChallanId = async (database) => {
  // Simple series: CH-YYMMDD-XXXX (last 4 digits increment by day & db)
  const pad = (x, l = 4) => String(x).padStart(l, "0");
  const today = new Date();
  const YY = String(today.getFullYear()).slice(-2);
  const MM = pad(today.getMonth() + 1, 2);
  const DD = pad(today.getDate(), 2);
  const prefix = `CH-${YY}${MM}${DD}`;

  // Find last for today + db
  const last = await Challan.findOne({
    database,
    challanId: new RegExp(`^${prefix}-`),
  })
    .sort({ createdAt: -1 })
    .select("challanId")
    .lean();

  let seq = 1;
  if (last?.challanId) {
    const parts = last.challanId.split("-");
    const tail = parts[parts.length - 1];
    const maybe = parseInt(tail, 10);
    if (!Number.isNaN(maybe)) seq = maybe + 1;
  }
  return `${prefix}-${pad(seq)}`;
};

/**
 * Compute line & header totals:
 * - Per line: price*qty → lineBasic
 * - Per-line discount % (if present) → taxableLine
 * - GST: IGST if igstTaxType===1 else split equally into CGST/SGST
 * - Header discount:
 *    * if discountAmount present => subtract absolute
 *    * else if discount<=100 => percent of (sum of line basics after item-level disc)
 *    * else treat as absolute
 * - Charges = otherCharges + shippingCost; taxed at max item GST rate
 * - amount (taxable) = (sum line taxable after item-level + header-level disc) + charges (pre-GST)
 * - total GST = item GST + charges GST
 * - grandTotal = round to nearest rupee; roundOff = diff
 */
const computeTotals = (payload) => {
  const doc = JSON.parse(JSON.stringify(payload || {}));
  const items = Array.isArray(doc.orderItems) ? doc.orderItems : [];
  const igstMode = toNum(doc.igstTaxType) === 1;

  let sumTaxableAfterItemDisc = 0;
  let sumCgst = 0;
  let sumSgst = 0;
  let sumIgst = 0;
  let maxGstRate = 0;

  // Compute per-line figures
  for (const it of items) {
    const qty = toNum(it.qty);
    const price = toNum(it.price);
    const lineBasic = round2(qty * price);
    const lineDiscPct = toNum(it.discountPercentage);
    const gstPct = toNum(it.gstPercentage);

    // Track max GST for charge taxation
    if (gstPct > maxGstRate) maxGstRate = gstPct;

    // After per-line discount
    const afterItemDiscount =
      lineDiscPct > 0 ? round2(lineBasic * (1 - lineDiscPct / 100)) : lineBasic;

    // GST split
    if (igstMode) {
      const igstAmt = round2((afterItemDiscount * gstPct) / 100);
      it.igstTotal = igstAmt;
      it.cgstTotal = 0;
      it.sgstTotal = 0;
      sumIgst += igstAmt;
    } else {
      const half = gstPct / 2;
      const cgstAmt = round2((afterItemDiscount * half) / 100);
      const sgstAmt = round2((afterItemDiscount * half) / 100);
      it.cgstTotal = cgstAmt;
      it.sgstTotal = sgstAmt;
      it.igstTotal = 0;
      sumCgst += cgstAmt;
      sumSgst += sgstAmt;
    }

    it.totalPrice = lineBasic;
    it.taxableAmount = afterItemDiscount;
    it.totalPriceWithDiscount = afterItemDiscount;
    it.BasicPrice = price; // align with your earlier data shape (if needed)
    it.BasicTotal = lineBasic;
    it.grandTotal = String(
      round2(
        afterItemDiscount +
          toNum(it.cgstTotal) +
          toNum(it.sgstTotal) +
          toNum(it.igstTotal)
      )
    );

    sumTaxableAfterItemDisc += afterItemDiscount;
  }

  // Header-level discount
  let headerDiscountAmount = 0;
  const rawDiscount = toNum(doc.discount); // may be percent or absolute
  if (toNum(doc.discountAmount) > 0) {
    headerDiscountAmount = toNum(doc.discountAmount);
  } else if (rawDiscount > 0) {
    if (rawDiscount <= 100) {
      headerDiscountAmount = round2(
        (sumTaxableAfterItemDisc * rawDiscount) / 100
      );
    } else {
      headerDiscountAmount = rawDiscount;
    }
  }

  // Charges (pre-GST)
  const shippingCost = toNum(doc.shippingCost);
  const otherCharges = toNum(doc.otherCharges);
  const chargesPreGst = round2(shippingCost + otherCharges);

  // Taxable base BEFORE GST = (items after item-level) - headerDisc + charges
  let taxableBase = round2(sumTaxableAfterItemDisc - headerDiscountAmount);
  if (taxableBase < 0) taxableBase = 0;
  taxableBase = round2(taxableBase + chargesPreGst);

  // GST on charges at max item rate
  let chargeCgst = 0,
    chargeSgst = 0,
    chargeIgst = 0;
  if (chargesPreGst > 0 && maxGstRate > 0) {
    if (igstMode) {
      chargeIgst = round2((chargesPreGst * maxGstRate) / 100);
    } else {
      const half = maxGstRate / 2;
      chargeCgst = round2((chargesPreGst * half) / 100);
      chargeSgst = round2((chargesPreGst * half) / 100);
    }
  }

  // Totals
  const totalCgst = round2(sumCgst + chargeCgst);
  const totalSgst = round2(sumSgst + chargeSgst);
  const totalIgst = round2(sumIgst + chargeIgst);
  const totalGst = round2(totalCgst + totalSgst + totalIgst);

  const preRoundGrand = round2(taxableBase + totalGst);
  const roundedGrand = roundRupeeHalfUp(preRoundGrand);
  const roundOff = round2(roundedGrand - preRoundGrand);

  // Patch back
  doc.amount = taxableBase; // your "amount" == taxable base
  doc.taxAmount = totalGst;
  doc.cgstTotal = totalCgst;
  doc.sgstTotal = totalSgst;
  doc.igstTotal = totalIgst;
  doc.roundOff = roundOff;
  doc.grandTotal = roundedGrand;
  doc.discountAmount = headerDiscountAmount;

  // gstOtherCharges hint (so UI can know the charge rate used)
  if (chargesPreGst > 0) {
    doc.gstOtherCharges = [
      {
        rate: maxGstRate,
        cgst: chargeCgst,
        sgst: chargeSgst,
        igst: chargeIgst,
        base: chargesPreGst,
        igstMode,
      },
    ];
  } else {
    doc.gstOtherCharges = [];
  }

  return doc;
};

/* ========= Controllers ========= */

// POST /api/challans
export const createChallan = async (req, res) => {
  try {
    const payload = { ...(req.body || {}) };

    if (!payload.database) {
      return res.status(400).json({ message: "database is required" });
    }
    if (!payload.userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // challanId generator (only if client didn't send)
    if (!payload.challanId) {
      payload.challanId = await genChallanId(payload.database);
    }

    const computed = computeTotals(payload);
    const doc = await Challan.create(computed);

    // Optional populate for immediate UI readiness
    await doc.populate([
      { path: "partyId" },
      { path: "userId" },
      { path: "orderItems.productId" },
    ]);

    return res.status(201).json({ message: "Challan created", challan: doc });
  } catch (err) {
    console.error("[createChallan] error", err);
    return res
      .status(500)
      .json({ message: "Failed to create challan", error: err.message });
  }
};

// GET /api/challans/:id
export const getChallanById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Challan.findById(id).populate([
      { path: "partyId" },
      { path: "userId" },
      { path: "orderItems.productId" },
    ]);
    if (!doc) return res.status(404).json({ message: "Challan not found" });
    return res.json({ challan: doc });
  } catch (err) {
    console.error("[getChallanById] error", err);
    return res
      .status(500)
      .json({ message: "Failed to get challan", error: err.message });
  }
};

// GET /api/challans/list/:userId/:database?status=...
export const listChallans = async (req, res) => {
  try {
    const { userId, database } = req.params;
    const { status } = req.query;

    if (!userId || !database) {
      return res
        .status(400)
        .json({ message: "userId and database are required" });
    }

    const q = { userId, database, deletedAt: { $exists: false } };
    if (status) q.status = status;

    const docs = await Challan.find(q)
      .sort({ createdAt: -1 })
      .populate([{ path: "partyId" }, { path: "userId" }]);

    return res.json({ challans: docs });
  } catch (err) {
    console.error("[listChallans] error", err);
    return res
      .status(500)
      .json({ message: "Failed to list challans", error: err.message });
  }
};

// PUT /api/challans/:id
export const updateChallan = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Challan.findById(id);
    if (!existing)
      return res.status(404).json({ message: "Challan not found" });

    const merged = { ...existing.toObject(), ...(req.body || {}) };

    // If client changed items/figures, recompute
    const computed = computeTotals(merged);

    const updated = await Challan.findByIdAndUpdate(id, computed, {
      new: true,
    }).populate([
      { path: "partyId" },
      { path: "userId" },
      { path: "orderItems.productId" },
    ]);

    return res.json({ message: "Challan updated", challan: updated });
  } catch (err) {
    console.error("[updateChallan] error", err);
    return res
      .status(500)
      .json({ message: "Failed to update challan", error: err.message });
  }
};

// POST /api/challans/:id/status { status }
export const updateChallanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ message: "status is required" });

    const updated = await Challan.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate([{ path: "partyId" }, { path: "userId" }]);

    if (!updated) return res.status(404).json({ message: "Challan not found" });
    return res.json({ message: "Status updated", challan: updated });
  } catch (err) {
    console.error("[updateChallanStatus] error", err);
    return res
      .status(500)
      .json({ message: "Failed to update status", error: err.message });
  }
};

// DELETE /api/challans/:id  (soft delete)
export const deleteChallan = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Challan.findByIdAndUpdate(
      id,
      { status: "Deactive", deletedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Challan not found" });
    return res.json({ message: "Challan deleted (soft)", challan: updated });
  } catch (err) {
    console.error("[deleteChallan] error", err);
    return res
      .status(500)
      .json({ message: "Failed to delete challan", error: err.message });
  }
};
