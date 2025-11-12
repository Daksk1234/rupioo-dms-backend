import multer from "multer";
import ExcelJS from "exceljs";
import CombinedTarget from "../model/combinedTarget.model.js";

const upload = multer({ storage: multer.memoryStorage() });
export const combinedTargetUpload = upload.single("file");

const num = (v) => (isFinite(+v) ? +v : 0);

/**
 * Create / Upsert Combined Target (JSON or Excel)
 * POST /combined-targets
 * - JSON body:
 *    { date: "November-2025", incrementPercent?: number, products: [{productId, qtyAssign, price, totalPrice}], grandTotal?, created_by?, database? }
 *   If a document exists for the same `date`, it will be updated (upsert by date).
 *
 * - Excel body (multipart form-data, field "file"):
 *   Columns expected: productId, qtyAssign, price, month (optional), percentage (optional)
 *   You can also send form fields: date, incrementPercent, created_by, database
 */
export const saveCombinedTarget = async (req, res) => {
  try {
    // ===== Path A: Excel upload =====
    if (req.file) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.getWorksheet(1) || workbook.worksheets?.[0];
      if (!sheet) {
        return res
          .status(400)
          .json({ status: false, message: "Empty Excel file" });
      }

      const headerRow = sheet.getRow(1);
      const headers = (headerRow?.values || [])
        .slice(1)
        .map((h) => String(h || "").trim());
      const colIndex = (name) =>
        headers.findIndex((h) => h.toLowerCase() === name.toLowerCase()) + 1;

      const ciProduct = colIndex("productId");
      const ciQty = colIndex("qtyAssign");
      const ciPrice = colIndex("price");
      const ciMonth = colIndex("month");
      const ciPct = colIndex("percentage"); // optional per-row

      if (!ciProduct || !ciQty) {
        return res.status(400).json({
          status: false,
          message: "Sheet must contain 'productId' and 'qtyAssign' columns",
        });
      }

      // Top-level fields (from form)
      const dateFromForm = String(req.body?.date || "");
      const globalPct = num(req.body?.incrementPercent ?? 0);
      const created_by = req.body?.created_by || undefined;
      const database = req.body?.database || undefined;

      const products = [];
      let monthLabel = dateFromForm || "";

      for (let r = 2; r <= sheet.actualRowCount; r++) {
        const row = sheet.getRow(r);
        const productId = row.getCell(ciProduct)?.value ?? "";
        const qty = num(row.getCell(ciQty)?.value ?? 0);
        if (!productId || qty <= 0) continue;

        const price = num(ciPrice ? row.getCell(ciPrice)?.value ?? 0 : 0);
        const pctRow = num(ciPct ? row.getCell(ciPct)?.value ?? 0 : 0);

        if (!monthLabel && ciMonth) {
          const mv = row.getCell(ciMonth)?.value;
          if (mv) monthLabel = String(mv);
        }

        const appliedPct = pctRow || globalPct || 0;
        const finalQty = qty + (qty * appliedPct) / 100;

        products.push({
          productId:
            typeof productId === "object" && productId?.text
              ? productId.text
              : String(productId),
          qtyAssign: finalQty,
          price,
          totalPrice: price * finalQty,
        });
      }

      if (!products.length) {
        return res
          .status(400)
          .json({ status: false, message: "No valid rows found in sheet" });
      }

      const grand = products.reduce((s, p) => s + num(p.totalPrice), 0);
      const doc = {
        date: monthLabel || null,
        incrementPercent: globalPct || 0,
        products,
        grandTotal: grand,
        created_by,
        database,
      };

      // Upsert by date
      let saved;
      if (doc.date) {
        const existing = await CombinedTarget.findOne({ date: doc.date });
        if (existing) {
          existing.incrementPercent = doc.incrementPercent;
          existing.products = doc.products;
          existing.grandTotal = doc.grandTotal;
          if (doc.created_by) existing.created_by = doc.created_by;
          if (doc.database) existing.database = doc.database;
          saved = await existing.save();
        } else {
          saved = await CombinedTarget.create(doc);
        }
      } else {
        saved = await CombinedTarget.create(doc);
      }

      return res.json({
        status: true,
        message: "Combined target saved",
        data: saved,
      });
    }

    // ===== Path B: JSON payload =====
    const {
      date,
      incrementPercent = 0,
      products = [],
      grandTotal,
      created_by,
      database,
    } = req.body || {};

    if (!date || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields (date, products)",
      });
    }

    const normalized = products.map((p) => {
      const qty = num(p.qtyAssign);
      const price = num(p.price);
      const total = p.totalPrice != null ? num(p.totalPrice) : qty * price;
      return {
        productId: p.productId,
        qtyAssign: qty,
        price,
        totalPrice: total,
      };
    });

    const computedGrand = normalized.reduce((s, p) => s + num(p.totalPrice), 0);

    const payload = {
      date: String(date),
      incrementPercent: num(incrementPercent),
      products: normalized,
      grandTotal: grandTotal != null ? num(grandTotal) : computedGrand,
      created_by,
      database,
    };

    let saved;
    const existing = await CombinedTarget.findOne({ date: payload.date });
    if (existing) {
      existing.incrementPercent = payload.incrementPercent;
      existing.products = payload.products;
      existing.grandTotal = payload.grandTotal;
      if (payload.created_by) existing.created_by = payload.created_by;
      if (payload.database) existing.database = payload.database;
      saved = await existing.save();
    } else {
      saved = await CombinedTarget.create(payload);
    }

    return res.json({
      status: true,
      message: "Combined target saved",
      data: saved,
    });
  } catch (err) {
    console.error("saveCombinedTarget error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/** GET /combined-targets  */
export const listCombinedTargets = async (req, res) => {
  try {
    const { database } = req.query || {};
    const q = {};
    if (database) q.database = database;
    const data = await CombinedTarget.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ status: true, data });
  } catch (err) {
    console.error("listCombinedTargets error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

/** PUT /combined-targets/:id */
export const updateCombinedTarget = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const updated = await CombinedTarget.findByIdAndUpdate(id, body, {
      new: true,
    });
    if (!updated) {
      return res
        .status(404)
        .json({ status: false, message: "Combined target not found" });
    }
    return res.json({
      status: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updateCombinedTarget error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

/** DELETE /combined-targets/:id */
export const deleteCombinedTarget = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await CombinedTarget.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ status: false, message: "Combined target not found" });
    }
    return res.json({ status: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("deleteCombinedTarget error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};
