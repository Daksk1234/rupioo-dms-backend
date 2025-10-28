import axios from "axios";
import { TargetCreation } from "../model/targetCreation.model.js";
import { Product } from "../model/product.model.js";
import { User } from "../model/user.model.js";
import { getUserHierarchyBottomToTop } from "../rolePermission/RolePermission.js";
import { Customer } from "../model/customer.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import moment from "moment";
import { Role } from "../model/role.model.js";
import xlsx from "xlsx";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import { populate } from "dotenv";
const uniqueId = new Set();
const uniqueUserId = new Set();
const emptyObj = {};

/* ------------------------------- helpers ------------------------------- */

const isValidObjectId = (v) => {
  try {
    return !!(v && mongoose.Types.ObjectId.isValid(v));
  } catch {
    return false;
  }
};

const two = (n) => (n < 10 ? `0${n}` : `${n}`);

const monthKey = (y, m) => `${y}-${two(m)}`;

// FY months Apr→Mar
const FY_MONTHS = [
  { m: 4, name: "Apr" },
  { m: 5, name: "May" },
  { m: 6, name: "Jun" },
  { m: 7, name: "Jul" },
  { m: 8, name: "Aug" },
  { m: 9, name: "Sep" },
  { m: 10, name: "Oct" },
  { m: 11, name: "Nov" },
  { m: 12, name: "Dec" },
  { m: 1, name: "Jan" },
  { m: 2, name: "Feb" },
  { m: 3, name: "Mar" },
];

const buildFYMonths = (fyStartYear) =>
  FY_MONTHS.map(({ m, name }) => {
    const y = m >= 4 ? fyStartYear : fyStartYear + 1;
    return { key: monthKey(y, m), label: name, year: y, month: m };
  });

const fyRange = (fyStartYear) => {
  const start = new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0)); // Apr 1
  const end = new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59, 999)); // Mar 31 next year
  return { start, end };
};

const monthRangeUTC = (year, month /* 1..12 */) => {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // exclusive
  return { start, end };
};

const prevYearMonth = (y, m) =>
  m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };

/* Fetch product docs by either _id or sId string */
const fetchProductMap = async (productIds) => {
  const objIds = productIds
    .filter(isValidObjectId)
    .map((x) => new mongoose.Types.ObjectId(x));
  const sIds = productIds.filter((x) => !isValidObjectId(x));

  const [byObjId, bySId] = await Promise.all([
    objIds.length ? Product.find({ _id: { $in: objIds } }).lean() : [],
    sIds.length ? Product.find({ sId: { $in: sIds } }).lean() : [],
  ]);

  const map = {};
  for (const p of [...byObjId, ...bySId]) {
    map[String(p._id)] = p;
    if (p.sId) map[p.sId] = p;
  }
  return map;
};

const num = (v) => (isFinite(+v) ? +v : 0);

export const FYSummary = async (req, res) => {
  try {
    const { salesPersonIds = [], fyStartYear, database } = req.body || {};
    if (!Array.isArray(salesPersonIds) || !salesPersonIds.length) {
      return res
        .status(400)
        .json({ status: false, message: "salesPersonIds[] required" });
    }
    if (!fyStartYear && fyStartYear !== 0) {
      return res
        .status(400)
        .json({ status: false, message: "fyStartYear required" });
    }

    // optional safety: ensure the users exist (and match database if provided)
    const users = await User.find({
      _id: {
        $in: salesPersonIds.map((id) =>
          isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
        ),
      },
      ...(database ? { database } : {}),
    })
      .select("_id")
      .lean();

    if (!users.length) {
      return res
        .status(404)
        .json({ status: false, message: "No matching sales people" });
    }

    const { start, end } = fyRange(+fyStartYear);

    const targets = await TargetCreation.find({
      userId: { $in: users.map((u) => String(u._id)) },
      createdAt: { $gte: start, $lte: end },
      ...(database ? { database } : {}),
    })
      .select("createdAt grandTotal products.totalPrice")
      .lean();

    const months = buildFYMonths(+fyStartYear);
    const totalsByKey = {};
    for (const m of months) totalsByKey[m.key] = 0;

    for (const t of targets) {
      const y = t.createdAt.getUTCFullYear();
      const m = t.createdAt.getUTCMonth() + 1;
      const key = monthKey(y, m);
      const gt =
        num(t.grandTotal) ||
        (t.products || []).reduce((a, p) => a + num(p.totalPrice), 0);
      if (key in totalsByKey) totalsByKey[key] += gt;
    }

    const outMonths = months.map((m) => ({
      ...m,
      grandTotal: totalsByKey[m.key] || 0,
    }));
    const totalForFY = outMonths.reduce((a, b) => a + b.grandTotal, 0);

    return res
      .status(200)
      .json({ status: true, months: outMonths, totalForFY });
  } catch (err) {
    console.error("fy-summary error", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};
export const MonthMatrics = async (req, res) => {
  try {
    const {
      salesPersonIds = [],
      fyStartYear,
      year,
      month,
      database,
    } = req.body || {};
    if (!Array.isArray(salesPersonIds) || !salesPersonIds.length) {
      return res
        .status(400)
        .json({ status: false, message: "salesPersonIds[] required" });
    }
    if (![fyStartYear, year, month].every((v) => v || v === 0)) {
      return res
        .status(400)
        .json({ status: false, message: "fyStartYear, year & month required" });
    }

    // Users check (optional)
    const users = await User.find({
      _id: {
        $in: salesPersonIds.map((id) =>
          isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
        ),
      },
      ...(database ? { database } : {}),
    })
      .select("_id")
      .lean();

    if (!users.length) {
      return res
        .status(404)
        .json({ status: false, message: "No matching sales people" });
    }

    const { start: fyStart, end: fyEnd } = fyRange(+fyStartYear);
    const { start: cmStart, end: cmEnd } = monthRangeUTC(+year, +month);
    const { y: ly, m: lm } = prevYearMonth(+year, +month);
    const { start: lmStart, end: lmEnd } = monthRangeUTC(ly, lm);

    /* -------- Targets (within FY) -------- */
    const targets = await TargetCreation.find({
      userId: { $in: users.map((u) => String(u._id)) },
      createdAt: { $gte: fyStart, $lte: fyEnd },
      ...(database ? { database } : {}),
    })
      .select(
        "createdAt products.productId products.qtyAssign products.price products.totalPrice"
      )
      .lean();

    // product -> accumulators
    const prodAgg = new Map();

    const touch = (key) => {
      if (!prodAgg.has(key)) {
        prodAgg.set(key, {
          productKey: key,
          productName: "",
          salePrice: 0,

          targetQty: 0,
          productTotal: 0,

          cmTarget: 0,
          lmTarget: 0,
          yTarget: 0,

          cmAch: 0,
          lmAch: 0,
          yAch: 0,
        });
      }
      return prodAgg.get(key);
    };

    // For product details later
    const productIds = new Set();

    for (const t of targets) {
      const created = t.createdAt;
      const inCM = created >= cmStart && created < cmEnd;
      const inLM = created >= lmStart && created < lmEnd;

      for (const p of t.products || []) {
        const pid = String(p.productId || "");
        if (!pid) continue;
        productIds.add(pid);
        const row = touch(pid);

        row.salePrice = row.salePrice || num(p.price);
        row.productTotal += num(p.totalPrice);
        row.targetQty += num(p.qtyAssign);
        row.yTarget += num(p.qtyAssign);
        if (inCM) row.cmTarget += num(p.qtyAssign);
        if (inLM) row.lmTarget += num(p.qtyAssign);
      }
    }

    /* -------- Achievements (orders) -------- */
    // All orders for selected users inside FY for yearly; month windows for cm/lm
    const orderQueryFY = {
      userId: { $in: users.map((u) => u._id) },
      status: "completed",
      date: { $gte: fyStart, $lte: fyEnd },
      ...(database ? { database } : {}),
    };
    const orderQueryCM = {
      ...orderQueryFY,
      date: { $gte: cmStart, $lt: cmEnd },
    };
    const orderQueryLM = {
      ...orderQueryFY,
      date: { $gte: lmStart, $lt: lmEnd },
    };

    const [ordersFY, ordersCM, ordersLM] = await Promise.all([
      CreateOrder.find(orderQueryFY)
        .select("orderItems.productId orderItems.qty")
        .lean(),
      CreateOrder.find(orderQueryCM)
        .select("orderItems.productId orderItems.qty")
        .lean(),
      CreateOrder.find(orderQueryLM)
        .select("orderItems.productId orderItems.qty")
        .lean(),
    ]);

    const addAch = (orders, field) => {
      for (const o of orders) {
        for (const it of o.orderItems || []) {
          const pid = String(it.productId);
          const row = touch(pid);
          row[field] += num(it.qty);
        }
      }
    };

    addAch(ordersFY, "yAch");
    addAch(ordersCM, "cmAch");
    addAch(ordersLM, "lmAch");

    /* -------- Attach product names/prices -------- */
    const prodMap = await fetchProductMap([...productIds]);
    for (const [pid, row] of prodAgg.entries()) {
      const p = prodMap[pid];
      const title =
        p?.Product_Title ||
        p?.Product_Name ||
        p?.name ||
        `${p?.category || ""} ${p?.SubCategory || ""}`.trim() ||
        "Untitled Product";
      row.productName = title;
      if (!row.salePrice) {
        row.salePrice = num(p?.SalesRate || p?.Product_MRP || 0);
      }
    }

    /* -------- Shortfalls & output rows -------- */
    const rows = Array.from(prodAgg.values()).map((r) => ({
      productName: r.productName,
      salePrice: r.salePrice,
      productTotal: num(r.productTotal),
      targetQty: num(r.targetQty),

      cmTarget: num(r.cmTarget),
      lmTarget: num(r.lmTarget),
      yTarget: num(r.yTarget),

      cmAch: num(r.cmAch),
      lmAch: num(r.lmAch),
      yAch: num(r.yAch),

      cmShort: num(r.cmTarget) - num(r.cmAch),
      lmShort: num(r.lmTarget) - num(r.lmAch),
      yShort: num(r.yTarget) - num(r.yAch),
    }));

    return res.status(200).json({ status: true, rows });
  } catch (err) {
    console.error("month-metrics error", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

export const SaveTargetCreation1 = async (req, res) => {
  try {
    const party = await Customer.findById({ _id: req.body.partyId });
    const user = await User.findById({ _id: req.body.created_by });
    if (!user) {
      return res.status(400).json({ message: "User Not Found", status: false });
    }
    req.body.database = user.database;
    const target = await TargetCreation.create(req.body);
    const existingTarget = await TargetCreation.find({
      userId: party.created_by,
    }).sort({ sortorder: -1 });
    const tar = existingTarget[existingTarget.length - 1];
    if (tar) {
      for (let product of tar.products) {
        const existingProduct = req.body.products.find(
          (p) => p.productId === product.productId
        );
        console.log("existing" + existingProduct);
        if (existingProduct) {
          existingProduct.qtyAssign += product.qtyAssign;
          existingProduct.totalPrice = product.qtyAssign * product.price;
        } else {
          tar.products.push(product);
        }
      }
      tar.grandTotal += req.body.grandTotal;
      await existingTarget.save();
    }
    req.body.partyId = undefined;
    req.body.created_by = undefined;
    req.body.userId = await party.created_by;
    const newTarget = await TargetCreation.create(req.body);
    return target && newTarget
      ? res
          .status(200)
          .json({ message: "Target save successfully", status: true })
      : res
          .status(400)
          .json({ message: "Something Went Wrong", status: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
// save target start assign party and salesPerson
export const SaveTargetCreation555 = async (req, res) => {
  try {
    const party = await Customer.findById(req.body.partyId);
    const user = await User.findById(req.body.created_by);
    if (!user) {
      return res.status(400).json({ message: "User Not Found", status: false });
    }
    req.body.database = user.database;
    const target = await TargetCreation.create(req.body);
    const existingTargets = await TargetCreation.find({
      userId: party.created_by,
    }).sort({ sortorder: -1 });
    const lastTarget = existingTargets[existingTargets.length - 1];
    if (lastTarget) {
      for (let product of req.body.products) {
        const existingProduct = lastTarget.products.find(
          (p) => p.productId === product.productId
        );
        if (existingProduct) {
          existingProduct.qtyAssign += product.qtyAssign;
          existingProduct.totalPrice =
            existingProduct.qtyAssign * existingProduct.price;
        } else {
          lastTarget.products.push(product);
        }
      }
      lastTarget.grandTotal += req.body.grandTotal;
      await lastTarget.save();
      await TargetAssignUser(party.created_by, req.body.grandTotal);
    } else {
      req.body.partyId = undefined;
      req.body.created_by = undefined;
      req.body.userId = party.created_by;
      const newTarget = await TargetCreation.create(req.body);
      await TargetAssignUser(party.created_by, req.body.grandTotal);
    }
    return res
      .status(200)
      .json({ message: "Target saved successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
// save target start from salesPerson

export const SaveTargetCreation = async (req, res) => {
  try {
    // ---------- Helper: normalize products from rows ----------
    const normalizeRowsToProducts = (rows) => {
      return rows
        .filter((r) => r != null)
        .filter((r) => r.qtyAssign != null && Number(r.qtyAssign) > 0)
        .map((r) => {
          // allow headers: month/percentage OR assignPercentage
          let assignPercentage = [];
          if (r.month != null && r.percentage != null) {
            assignPercentage = [
              {
                month: Number(r.month),
                percentage: Number(r.percentage),
              },
            ];
          } else if (r.assignPercentage != null) {
            // allow "assignPercentage" as a number for the selected month, if provided
            const p = Number(r.assignPercentage);
            if (!Number.isNaN(p)) {
              // month optional in sheet → omit month, or put 0
              assignPercentage = [
                { month: Number(r.month) || 0, percentage: p },
              ];
            }
          }

          return {
            productId: r.productId,
            qtyAssign: Number(r.qtyAssign) || 0,
            price: Number(r.price) || 0,
            totalPrice:
              Number(r.totalPrice) ||
              (Number(r.qtyAssign) || 0) * (Number(r.price) || 0),
            assignPercentage,
          };
        });
    };

    // =========================================================
    // 1) BRANCH A: Excel upload (multipart/form-data with req.file)
    // =========================================================
    if (req.file) {
      // Read the file regardless of multer storage engine
      const buf = req.file.buffer
        ? req.file.buffer
        : await fs.readFile(req.file.path);

      const workbook = xlsx.read(buf, { type: "buffer" });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        return res
          .status(400)
          .json({ message: "Excel workbook has no sheets" });
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rows = xlsx.utils.sheet_to_json(sheet); // array of objects

      if (!rows.length) {
        return res.status(400).json({ message: "Excel file is empty" });
      }

      // We expect userId column in the rows (template has it)
      const userId = rows[0]?.userId;
      if (!userId) {
        return res
          .status(400)
          .json({ message: "Missing userId column in Excel" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({ message: "User Not Found" });
      }

      const products = normalizeRowsToProducts(rows);
      if (!products.length) {
        return res
          .status(400)
          .json({ message: "No valid products with qtyAssign found." });
      }

      const grandTotal = products.reduce(
        (sum, p) => sum + (p.totalPrice || 0),
        0
      );

      const targetData = {
        userId,
        created_by: user.created_by,
        database: user.database,
        salesPersonId: "salesPerson",
        products,
        grandTotal,
      };

      await TargetCreation.create(targetData);

      // --- roll-up to parent (unchanged logic) ---
      const checkUser = await User.findById(user.created_by).populate(
        "rolename"
      );
      if (checkUser?.rolename?.roleName === "SuperAdmin") {
        return res
          .status(200)
          .json({ message: "Target saved successfully", status: true });
      }

      const existingTargets = await TargetCreation.find({
        userId: user.created_by,
      }).sort({ sortorder: -1 });
      const lastTarget = existingTargets[existingTargets.length - 1];

      if (lastTarget) {
        for (const product of products) {
          const existingProduct = lastTarget.products.find(
            (p) => p.productId === product.productId
          );
          if (existingProduct) {
            existingProduct.qtyAssign += product.qtyAssign;
            existingProduct.totalPrice =
              existingProduct.qtyAssign * product.price;
          } else {
            lastTarget.products.push(product);
          }
        }
        lastTarget.grandTotal += grandTotal;
        await lastTarget.save();
        await TargetAssignUser(user.created_by, grandTotal);
      } else {
        const newPayload = {
          userId: user.created_by,
          products,
          grandTotal,
          database: user.database,
        };
        await TargetCreation.create(newPayload);
        await TargetAssignUser(user.created_by, grandTotal);
      }

      return res
        .status(200)
        .json({ message: "Target saved successfully", status: true });
    }

    // =========================================================
    // 2) BRANCH B: JSON payload (no file upload)
    // =========================================================
    // Allow front-end “form submit” path that sends JSON { userId, products, grandTotal, date? ... }
    if (!req.file && Array.isArray(req.body?.products)) {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({
          message: "userId is required in body when no file is uploaded",
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({ message: "User Not Found" });
      }

      // Trust incoming products but normalize & fill totals if missing
      const products = normalizeRowsToProducts(req.body.products);
      if (!products.length) {
        return res.status(400).json({ message: "No valid products in body" });
      }

      const grandTotal =
        req.body.grandTotal != null
          ? Number(req.body.grandTotal)
          : products.reduce((sum, p) => sum + (p.totalPrice || 0), 0);

      const targetData = {
        userId,
        created_by: user.created_by,
        database: user.database,
        salesPersonId: "salesPerson",
        date: req.body.date, // optional (e.g., "MMM-YYYY")
        products,
        grandTotal,
      };

      await TargetCreation.create(targetData);

      const checkUser = await User.findById(user.created_by).populate(
        "rolename"
      );
      if (checkUser?.rolename?.roleName === "SuperAdmin") {
        return res
          .status(200)
          .json({ message: "Target saved successfully", status: true });
      }

      const existingTargets = await TargetCreation.find({
        userId: user.created_by,
      }).sort({ sortorder: -1 });
      const lastTarget = existingTargets[existingTargets.length - 1];

      if (lastTarget) {
        for (const product of products) {
          const existingProduct = lastTarget.products.find(
            (p) => p.productId === product.productId
          );
          if (existingProduct) {
            existingProduct.qtyAssign += product.qtyAssign;
            existingProduct.totalPrice =
              existingProduct.qtyAssign * product.price;
          } else {
            lastTarget.products.push(product);
          }
        }
        lastTarget.grandTotal += grandTotal;
        await lastTarget.save();
        await TargetAssignUser(user.created_by, grandTotal);
      } else {
        const newPayload = {
          userId: user.created_by,
          products,
          grandTotal,
          database: user.database,
        };
        await TargetCreation.create(newPayload);
        await TargetAssignUser(user.created_by, grandTotal);
      }

      return res
        .status(200)
        .json({ message: "Target saved successfully", status: true });
    }

    // If we got here, neither a file nor a JSON products array was sent
    return res.status(400).json({
      message: "Excel file is required OR provide JSON { userId, products[] }",
    });
  } catch (error) {
    console.error("Error in SaveTargetCreation:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  } finally {
    // If using disk storage, optionally clean up temp file
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch {}
    }
  }
};

// export const SaveTargetCreation = async (req, res) => {
//     try {
//         const user = await User.findById(req.body.userId);
//         if (!user) {
//             return res.status(400).json({ message: "User Not Found", status: false });
//         }
//         req.body.database = user.database;
//         req.body.salesPersonId = "salesPerson";
//         const target = await TargetCreation.create(req.body);
//         req.body.salesPersonId = undefined
//         // check user role
//         const checkUser = await User.findById(user.created_by).populate({ path: "rolename", model: "role" });
//         if (checkUser.rolename.roleName === "SuperAdmin") {
//             console.log("SuperAdmin detected, not saving target.");
//             return res.status(200).json({ message: "Target saved successfully", status: true });
//         }
//         const existingTargets = await TargetCreation.find({ userId: user.created_by }).sort({ sortorder: -1 });
//         const lastTarget = existingTargets[existingTargets.length - 1];
//         if (lastTarget) {
//             for (let product of req.body.products) {
//                 const existingProduct = lastTarget.products.find(p => p.productId === product.productId);
//                 if (existingProduct) {
//                     existingProduct.qtyAssign += product.qtyAssign;
//                     existingProduct.totalPrice = existingProduct.qtyAssign * existingProduct.price;
//                 } else {
//                     lastTarget.products.push(product);
//                 }
//             }
//             lastTarget.grandTotal += req.body.grandTotal;
//             await lastTarget.save();
//             await TargetAssignUser(user.created_by, req.body.grandTotal)
//         } else {
//             req.body.userId = user.created_by;
//             const newTarget = await TargetCreation.create(req.body);
//             await TargetAssignUser(user.created_by, req.body.grandTotal)
//         }
//         return res.status(200).json({ message: "Target saved successfully", status: true });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: "Internal Server Error" });
//     }
// };

export const DeleteTargetCreation = async (req, res, next) => {
  try {
    const target = await TargetCreation.findByIdAndDelete({
      _id: req.params.id,
    });
    return target
      ? res.status(200).json({ message: "delete successful", status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};

export const UpdateTargetCreation = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const existingTarget = await TargetCreation.findById(targetId);
    if (!existingTarget) {
      return res.status(404).json({ error: "Target not found", status: false });
    } else {
      const updatedTarget = req.body;
      await TargetCreation.findByIdAndUpdate(targetId, updatedTarget, {
        new: true,
      });
      return res
        .status(200)
        .json({ message: "Target Updated Successfully", status: true });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewTargetCreation = async (req, res, next) => {
  try {
    // const userId = req.params.id;
    // const adminDetail = await getTargetCreationHierarchy(userId);
    // const adminDetail = adminDetails.length === 1 ? adminDetails[0] : adminDetails;
    const userId = req.params.id;
    const database = req.params.database;
    const adminDetail = await getUserHierarchyBottomToTop(userId, database);
    if (!adminDetail.length > 0) {
      return res.status(404).json({ error: "Target Not Found", status: false });
    }
    let target = await TargetCreation.find({ database: database })
      .sort({ sortorder: -1 })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "products.productId", model: "product" });
    return target.length > 0
      ? res.status(200).json({ TargetCreation: target, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewTargetCreationById = async (req, res, next) => {
  try {
    let target = await TargetCreation.find({ userId: req.params.id })
      .populate({ path: "salesPersonId", model: "user" })
      .populate({ path: "products.productId", model: "product" });
    // const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    // const currentMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    // const target = await TargetCreation.find({
    //     userId: req.params.id,
    //     createdAt: {
    //         $gte: currentMonthStart,
    //         $lt: currentMonthEnd,
    //     }
    // }).populate({ path: 'salesPersonId', model: 'user' }).populate({ path: "products.productId", model: "product" });
    return target
      ? res.status(200).json({ TargetCreation: target, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deleteProductFromTargetCreation = async (req, res, next) => {
  const targetId = req.params.targetId;
  const productIdToDelete = req.params.productId;
  try {
    const target = await TargetCreation.findById(targetId);
    const productPrice = target.products.reduce((total, item) => {
      if (
        item.productId.toString().toLowerCase() ===
        productIdToDelete.toLowerCase()
      ) {
        return total + item.price * item.qtyAssign;
      }
      return total;
    }, 0);
    const updatedTarget = await TargetCreation.findByIdAndUpdate(
      targetId,
      { $pull: { products: { productId: productIdToDelete } } },
      { new: true }
    );
    if (updatedTarget) {
      const grandTotal = updatedTarget.grandTotal - productPrice;
      const updatedTargetWithGrandTotal =
        await TargetCreation.findByIdAndUpdate(
          targetId,
          { grandTotal: grandTotal },
          { new: true }
        );
      return res
        .status(200)
        .json({ TargetCreation: updatedTargetWithGrandTotal, status: true });
    } else {
      return res.status(404).json({ error: "Not Found", status: false });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};

export const Achievement = async (req, res) => {
  try {
    const salespersonId = req.params.id;
    const targets1 = await TargetCreation.findOne({ partyId: salespersonId });
    if (!targets1) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    const startDate = new Date(targets1.startDate);
    const endDate = new Date();
    const targets = await TargetCreation.findOne({
      partyId: salespersonId,
    });
    if (!targets) {
      return res
        .status(404)
        .json({ error: "Targets not found", status: false });
    }
    const orders = await CreateOrder.find({ partyId: targets1.partyId });
    if (!orders || orders.length === 0) {
      return res.status(404).json({ error: "Orders not found", status: false });
    }
    const allOrderItems = orders.flatMap((order) => order.orderItems);
    const aggregatedOrders = allOrderItems.reduce((acc, item) => {
      const existingItem = acc.find(
        (accItem) =>
          accItem.productId.toString() === item.productId._id.toString()
      );
      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.price += item.price;
      } else {
        acc.push({
          productId: item.productId._id.toString(),
          qty: item.qty,
          price: item.price,
        });
      }
      return acc;
    }, []);

    const productDetailsMap = {};
    const productIds = aggregatedOrders.map((order) => order.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    products.forEach((product) => {
      productDetailsMap[product._id.toString()] = product;
    });
    const achievements = targets.products
      .flatMap((targetProduct) => {
        const matchingOrders = aggregatedOrders.filter(
          (order) => order.productId === targetProduct.productId
        );
        if (matchingOrders.length > 0) {
          const actualQuantity = matchingOrders.reduce(
            (total, order) => total + order.qty,
            0
          );
          const actualTotalPrice = matchingOrders.reduce(
            (total, order) => total + order.qty * order.price,
            0
          );
          const productDetails =
            productDetailsMap[targetProduct.productId.toString()] || {};
          return {
            product: {
              productId: targetProduct.productId,
              details: productDetails,
            },
            targetQuantity: targetProduct.qtyAssign,
            actualQuantity: actualQuantity,
            achievementPercentage:
              (actualQuantity / targetProduct.qtyAssign) * 100,
            targetTotalPrice: targetProduct.price,
            actualTotalPrice: actualTotalPrice,
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const overallTargetQuantity = targets.products.reduce(
      (total, targetProduct) => total + targetProduct.qtyAssign,
      0
    );
    const overallActualQuantity = achievements.reduce(
      (total, achievement) => total + achievement.actualQuantity,
      0
    );
    const overallAchievementPercentage =
      (overallActualQuantity / overallTargetQuantity) * 100;
    // console.log(achievements.products.detail.Size)
    return res.status(200).json({ achievements, overallAchievementPercentage });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const updateTargetProducts = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const updatedFields = req.body;
    if (!targetId || !updatedFields) {
      return res
        .status(400)
        .json({ message: "Invalid input data", status: false });
    }
    const target = await TargetCreation.findById({ _id: targetId });
    if (!target) {
      return res
        .status(404)
        .json({ message: "Order not found", status: false });
    }
    const productItems = target.products || [];
    const newProductItems = updatedFields.products || [];
    for (const newProducts of newProductItems) {
      const oldProducts = productItems.find(
        (item) => item.productId.toString() === newProducts.productId
      );
      if (oldProducts) {
        oldProducts.productId = newProducts.productId || oldProducts.productId;
        oldProducts.qtyAssign = newProducts.qtyAssign || oldProducts.qtyAssign;
        oldProducts.price = newProducts.price || oldProducts.price;
        oldProducts.totalPrice =
          newProducts.totalPrice || oldProducts.totalPrice;
        oldProducts.assignPercentage =
          newProducts.assignPercentage || oldProducts.assignPercentage;
      }
      await oldProducts.save();
    }
    const updatedOrder = await target.save();
    return res.status(200).json({ Target: updatedOrder, status: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// -----------------------------------------------------------------------------------------

// increaseTarget month wise
export const increasePercentage555 = async (req, res, next) => {
  try {
    const customers = await Customer.find({})
      .sort({ sortorder: -1 })
      .select("created_by");
    if (!customers.length > 0) {
      return res
        .status(404)
        .json({ message: "Party Not Found", status: false });
    }
    let id;
    for (let customer of customers) {
      const date = new Date();
      const targetCreation = await TargetCreation.find({
        partyId: customer._id,
      });
      const target = targetCreation[targetCreation.length - 1];
      if (!target) {
        console.log(
          `TargetCreation document not found for party ${customer._id}`
        );
        continue;
      }
      const updatedProducts = target.products.map((items) => {
        if (
          items.assignPercentage.some(
            (item) => item.month === date.getMonth() + 1
          )
        ) {
          const updatedAssignments = items.assignPercentage.map((item) => {
            if (item.month === date.getMonth() + 1) {
              const increaseQty = (items.qtyAssign * item.percentage) / 100;
              const roundedIncreaseQty = Math.floor(increaseQty);
              const productQtyAssign = items.qtyAssign + roundedIncreaseQty;
              return {
                month: item.month,
                percentage: item.percentage,
                increase: productQtyAssign,
              };
            }
            return item;
          });
          const updatedItem = {
            productId: items.productId,
            qtyAssign: updatedAssignments[0].increase,
            price: items.price,
            totalPrice: updatedAssignments[0].increase * items.price,
            assignPercentage: updatedAssignments,
          };
          return updatedItem;
        }
        return items;
      });
      const grandtotal = updatedProducts.reduce(
        (total, item) => total + item.qtyAssign * item.price,
        0
      );
      const { _id, createdAt, updatedAt, ...targetWithoutId } =
        target.toObject();
      const updatedTarget = new TargetCreation({
        ...targetWithoutId,
        grandTotal: grandtotal,
        products: updatedProducts,
      });
      await updatedTarget.save();

      id = customer.created_by;
      await t1(id);
    }
    Object.assign(uniqueId, emptyObj);
    Object.assign(uniqueUserId, emptyObj);
  } catch (err) {
    console.error(err);
  }
};

export const increasePercentage = async (req, res, next) => {
  try {
    const customers = await User.find({})
      .sort({ sortorder: -1 })
      .select("created_by");
    if (!customers.length > 0) {
      return res
        .status(404)
        .json({ message: "Party Not Found", status: false });
    }
    let finalTarget;
    let id;
    let total = 0;
    for (let customer of customers) {
      const date = new Date();
      const targetCreation = await TargetCreation.find({
        userId: customer._id,
        salesPersonId: "salesPerson",
      });
      const target = targetCreation[targetCreation.length - 1];
      if (!target) {
        console.log(
          `TargetCreation document not found for party ${customer._id}`
        );
        continue;
      }
      const updatedProducts = target.products.map((items) => {
        if (
          items.assignPercentage.some(
            (item) => item.month === date.getMonth() + 1
          )
        ) {
          const updatedAssignments = items.assignPercentage.map((item) => {
            if (item.month === date.getMonth() + 1) {
              const increaseQty = (items.qtyAssign * item.percentage) / 100;
              const roundedIncreaseQty = Math.floor(increaseQty);
              const productQtyAssign = items.qtyAssign + roundedIncreaseQty;
              return {
                month: item.month,
                percentage: item.percentage,
                increase: productQtyAssign,
              };
            }
            return item;
          });
          const updatedItem = {
            productId: items.productId,
            qtyAssign: updatedAssignments[0].increase,
            price: items.price,
            totalPrice: updatedAssignments[0].increase * items.price,
            assignPercentage: updatedAssignments,
          };
          return updatedItem;
        }
        return items;
      });
      const grandtotal = updatedProducts.reduce(
        (total, item) => total + item.qtyAssign * item.price,
        0
      );
      const { _id, createdAt, updatedAt, ...targetWithoutId } =
        target.toObject();
      const updatedTarget = new TargetCreation({
        ...targetWithoutId,
        grandTotal: grandtotal,
        products: updatedProducts,
      });
      await updatedTarget.save();

      id = customer.created_by;
      await t1(id, grandtotal);
    }
    Object.assign(uniqueId, emptyObj);
    Object.assign(uniqueUserId, emptyObj);
  } catch (err) {
    console.error(err);
  }
};

// assing target salesPerson month's wise
export const t1555 = async function t1(createdById) {
  let partyTotal = 0;
  let storedData = [];
  let finalTarget;
  try {
    const createdByIdString = createdById.toString();
    if (!uniqueId.has(createdByIdString)) {
      uniqueId.add(createdByIdString);
      const newParty = await Customer.find({ created_by: createdById }).sort({
        sortorder: -1,
      });
      if (!newParty.length > 0) {
        console.log(`party not found`);
      }
      for (let item of newParty) {
        const target = await TargetCreation.find({ partyId: item._id }).sort({
          sortorder: -1,
        });
        const lastTarget = target[target.length - 1];
        if (lastTarget) {
          const dd = await salesPerson(lastTarget.products, storedData.slice());
          storedData = dd;
          partyTotal += lastTarget.grandTotal;
          finalTarget = lastTarget;
        }
      }
      if (finalTarget) {
        const { _id, products, createdAt, updatedAt, ...newTargetCreation } =
          finalTarget.toObject();
        const newCopyTarget = new TargetCreation({
          ...newTargetCreation,
          userId: createdById,
          grandTotal: partyTotal,
          products: storedData,
          partyId: undefined,
        });
        await newCopyTarget.save();
        await increaseTargetUserClosure(newCopyTarget.userId);
      }
    } else {
      console.log("Duplicate found:", createdByIdString);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

export const t1 = async function t1(createdById, total) {
  let partyTotal = 0;
  let storedData = [];
  let finalTarget;
  try {
    const createdByIdString = createdById.toString();
    if (!uniqueId.has(createdByIdString)) {
      uniqueId.add(createdByIdString);
      const newParty = await User.find({ created_by: createdById }).sort({
        sortorder: -1,
      });
      if (!newParty.length > 0) {
        console.log(`party not found`);
      }
      for (let item of newParty) {
        const target = await TargetCreation.find({ userId: item._id }).sort({
          sortorder: -1,
        });
        const lastTarget = target[target.length - 1];
        if (lastTarget) {
          const dd = await salesPerson(lastTarget.products, storedData.slice());
          storedData = dd;
          partyTotal += total;
          finalTarget = lastTarget;
        }
      }
      if (finalTarget) {
        const { _id, products, createdAt, updatedAt, ...newTargetCreation } =
          finalTarget.toObject();
        const newCopyTarget = new TargetCreation({
          ...newTargetCreation,
          userId: createdById,
          grandTotal: partyTotal,
          products: storedData,
          salesPersonId: undefined,
        });
        await newCopyTarget.save();
        await increaseTargetUserClosure(newCopyTarget.userId);
      }
    } else {
      console.log("Duplicate found:", createdByIdString);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

// assing user hierarchy target when targer created......
export const TargetAssignUser = (function () {
  let initialUserId = "";
  return async function TargetUser(userId, amount) {
    try {
      if (initialUserId === "") {
        initialUserId = userId;
        console.log("First call with userId: " + initialUserId);
      }
      const user = await User.findById(userId);
      if (!user) {
        return console.log("User Not Found");
      }
      const checkUser = await User.findById(user.created_by).populate({
        path: "rolename",
        model: "role",
      });
      if (checkUser.rolename.roleName === "SuperAdmin") {
        console.log("SuperAdmin detected, not saving target.");
        return console.log("completed...");
      }
      const targets = await TargetCreation.find({ userId: initialUserId }).sort(
        { sortorder: -1 }
      );
      if (targets.length === 0) {
        console.log("No targets found for user:");
      }
      const newTarget = targets[targets.length - 1];
      const existingTargets = await TargetCreation.find({
        userId: user.created_by,
      }).sort({ sortorder: -1 });
      const lastTarget = existingTargets[existingTargets.length - 1];
      let grandTotalSum = 0;
      if (lastTarget) {
        lastTarget.grandTotal += amount;
        await lastTarget.save();
      } else {
        const tar = new TargetCreation({
          userId: user.created_by,
          database: user.database,
          status: user.status,
          grandTotal: newTarget.grandTotal,
        });
        await tar.save();
      }
      await TargetUser(user.created_by, amount);
    } catch (error) {
      console.error(error);
    }
  };
})();

// assign target salesPerson with productId
const salesPerson = async function salesPerson(productsData, storedData) {
  storedData = storedData || [];
  for (const product of productsData) {
    const index = storedData.findIndex(
      (item) => item.productId === product.productId
    );
    if (index !== -1) {
      storedData[index].qtyAssign += product.qtyAssign;
      storedData[index].totalPrice += product.totalPrice;
      storedData[index].price = product.price;
    } else {
      storedData.push(product);
    }
  }
  return storedData;
};

// assing user hierarchy target month's wise
export const increaseTargetUserClosure555 = (function () {
  return async function increaseTargetUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return console.log("User Not Found");
      }
      const checkUser = await User.findById(user.created_by).populate({
        path: "rolename",
        model: "role",
      });

      if (checkUser.rolename.roleName === "SuperAdmin") {
        console.log("SuperAdmin detected, not saving target.");
        return console.log("completed...");
      }
      await t2(userId);
      await increaseTargetUser(user.created_by);
    } catch (error) {
      console.error(error);
    }
  };
})();

export const increaseTargetUserClosure = (function () {
  return async function increaseTargetUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return console.log("User Not Found");
      }
      const checkUser = await User.findById(user.created_by).populate({
        path: "rolename",
        model: "role",
      });
      if (checkUser.rolename.roleName === "SuperAdmin") {
        console.log("SuperAdmin detected, not saving target.");
        return console.log("completed...");
      }
      await t2(userId);
      await increaseTargetUser(user.created_by);
    } catch (error) {
      console.error(error);
    }
  };
})();

export const t2555 = async function t2(userId) {
  try {
    let partyTotal = 0;
    const createdBy = userId.toString();
    const user = await User.findById(userId);
    if (!user) {
      return console.log("User Not Found");
    }
    const newParty = await User.find({ created_by: user.created_by }).sort({
      sortorder: -1,
    });
    if (!newParty.length > 0) {
      console.log(`party not found`);
    }
    for (let item of newParty) {
      const target = await TargetCreation.find({ userId: item._id }).sort({
        sortorder: -1,
      });
      const lastTarget = target[target.length - 1];
      if (lastTarget) {
        partyTotal += lastTarget.grandTotal;
        finalTarget = lastTarget;
      }
    }
    if (partyTotal !== 0) {
      const us = await TargetCreation.find({ userId: user.created_by }).sort({
        sortorder: -1,
      });
      const last = us[us.length - 1].createdAt;
      const created = new Date(last);
      const current = new Date();
      if (current.getMonth() + 1 !== created.getMonth() + 1) {
        const tar = new TargetCreation({
          userId: user.created_by,
          startDate: new Date(),
          database: user.database,
          status: user.status,
          grandTotal: partyTotal,
        });
        await tar.save();
      } else {
        const us = await TargetCreation.find({ userId: user.created_by }).sort({
          sortorder: -1,
        });
        const last1 = us[us.length - 1];
        const date = last1.createdAt;
        const created = new Date(date);
        if (current.getMonth() + 1 === created.getMonth() + 1) {
          last1.grandTotal = partyTotal;
          await last1.save();
        } else {
          console.log("duplicate user");
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

export const t2 = async function t2(userId) {
  try {
    let partyTotal = 0;
    const createdBy = userId.toString();
    const user = await User.findById(userId);
    if (!user) {
      return console.log("User Not Found");
    }
    const newParty = await User.find({ created_by: user.created_by }).sort({
      sortorder: -1,
    });
    if (!newParty.length > 0) {
      console.log(`party not found`);
    }
    for (let item of newParty) {
      const target = await TargetCreation.find({ userId: item._id }).sort({
        sortorder: -1,
      });
      const lastTarget = target[target.length - 1];
      if (lastTarget) {
        partyTotal += lastTarget.grandTotal;
        finalTarget = lastTarget;
      }
    }
    if (partyTotal !== 0) {
      const us = await TargetCreation.find({ userId: user.created_by }).sort({
        sortorder: -1,
      });
      const last = us[us.length - 1].createdAt;
      const created = new Date(last);
      const current = new Date();
      if (current.getMonth() + 1 !== created.getMonth() + 1) {
        const tar = new TargetCreation({
          userId: user.created_by,
          database: user.database,
          status: user.status,
          grandTotal: partyTotal,
        });
        await tar.save();
      } else {
        const us = await TargetCreation.find({ userId: user.created_by }).sort({
          sortorder: -1,
        });
        const last1 = us[us.length - 1];
        const date = last1.createdAt;
        const created = new Date(date);
        if (current.getMonth() + 1 === created.getMonth() + 1) {
          last1.grandTotal = partyTotal;
          await last1.save();
        } else {
          console.log("duplicate user");
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

export const viewTarget = async (req, res, next) => {
  try {
    let target = [];
    const currentMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
    const currentMonthEnd = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    );
    const user = await User.find({
      created_by: req.params.id,
      status: "Active",
    })
      .sort({ sortorder: -1 })
      .select("_id");
    if (user.length > 0) {
      for (let id of user) {
        const user = await TargetCreation.find({
          userId: id._id,
          createdAt: { $gte: currentMonthStart, $lt: currentMonthEnd },
        }).populate({ path: "userId", model: "user" });
        if (!user.length > 0) {
          continue;
        }
        target.push(user);
      }
      const totalTarget = target.flat();
      return res.status(200).json({ Target: totalTarget, status: true });
    } else {
      const user = await Customer.find({
        created_by: req.params.id,
        status: "Active",
      })
        .sort({ sortorder: -1 })
        .select("_id");
      if (user.length > 0) {
        for (let id of user) {
          const user = await TargetCreation.find({
            partyId: id._id,
            createdAt: { $gte: currentMonthStart, $lt: currentMonthEnd },
          })
            .populate({ path: "products.productId", model: "product" })
            .populate({ path: "partyId", model: "customer" });
          if (!user.length > 0) {
            continue;
          }
          target.push(user);
        }
        const totalTarget = target.flat();
        return res.status(200).json({ Target: totalTarget, status: true });
      } else {
        const customer = await TargetCreation.find({
          partyId: req.params.id,
          createdAt: { $gte: currentMonthStart, $lt: currentMonthEnd },
        }).populate({ path: "products.productId", model: "product" });
        if (customer.length > 0) {
          return res.status(200).json({ Target: customer, status: true });
        }
        return res.status(404).json({ message: "Not Found", status: false });
      }
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
//----------------------------------------------------------------------------------------

// all party get achievement
export const latestAchievementById = async (req, res) => {
  try {
    const partyId = req.params.id;
    const customer = await Customer.findOne({
      _id: partyId,
      database: req.params.database,
      status: "Active",
    });
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const targetQuery = { partyId: partyId };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
    }

    const targetss = await TargetCreation.find(targetQuery)
      .populate({ path: "partyId", model: "customer" })
      .sort({ sortorder: -1 });
    const targets = targetss[targetss.length - 1];
    if (targetss.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    const orders = await CreateOrder.find({ partyId: targets.partyId });
    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "Order Not Found", status: false });
    }
    const allOrderItems = orders.flatMap((order) => order.orderItems);
    const aggregatedOrders = allOrderItems.reduce((acc, item) => {
      const existingItem = acc.find(
        (accItem) =>
          accItem.productId.toString() === item.productId._id.toString()
      );
      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.price += item.price;
      } else {
        acc.push({
          productId: item.productId._id.toString(),
          qty: item.qty,
          price: item.price,
        });
      }
      return acc;
    }, []);
    const productDetailsMap = {};
    const productIds = aggregatedOrders.map((order) => order.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    products.forEach((product) => {
      productDetailsMap[product._id.toString()] = product;
    });
    const achievements = targets.products
      .flatMap((targetProduct) => {
        const matchingOrders = aggregatedOrders.filter(
          (order) => order.productId === targetProduct.productId
        );
        if (matchingOrders.length > 0) {
          const actualQuantity = matchingOrders.reduce(
            (total, order) => total + order.qty,
            0
          );
          const actualTotalPrice = matchingOrders.reduce(
            (total, order) => total + order.qty * order.price,
            0
          );
          const productDetails =
            productDetailsMap[targetProduct.productId.toString()] || {};
          return {
            productId: productDetails,
            targetQuantity: targetProduct.qtyAssign,
            actualQuantity: actualQuantity,
            achievementPercentage:
              (actualQuantity / targetProduct.qtyAssign) * 100,
            productPrice: targetProduct.price,
            targetTotalPrice: targetProduct.totalPrice,
            actualTotalPrice: actualTotalPrice,
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const overallTargetQuantity = targets.products.reduce(
      (total, targetProduct) => total + targetProduct.qtyAssign,
      0
    );
    const overallActualQuantity = achievements.reduce(
      (total, achievement) => total + achievement.actualQuantity,
      0
    );
    const overallAchievementPercentage =
      (overallActualQuantity / overallTargetQuantity) * 100;

    customer.overallAchievementPercentage = overallAchievementPercentage;
    return res.status(200).json({
      customer,
      achievements,
      overallAchievementPercentage,
      status: true,
    });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};
export const latestAchievementSalesById1 = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findOne({
      _id: userId,
      database: req.params.database,
      status: "Active",
    });
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const targetQuery = { userId: userId };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
      // targetQuery.startDate = { $gte: startDate };
      // targetQuery.endDate = { $lte: endDate };
    }
    const targetss = await TargetCreation.find(targetQuery)
      .populate({ path: "userId", model: "user" })
      .populate({ path: "partyId", model: "customer" });
    const targets = targetss[targetss.length - 1];
    if (targetss.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    const orders = await CreateOrder.find({ userId: targets.userId });
    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "Order Not Found", status: false });
    }
    const allOrderItems = orders.flatMap((order) => order.orderItems);
    const aggregatedOrders = allOrderItems.reduce((acc, item) => {
      const existingItem = acc.find(
        (accItem) =>
          accItem.productId.toString() === item.productId._id.toString()
      );
      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.price += item.price;
      } else {
        acc.push({
          productId: item.productId._id.toString(),
          qty: item.qty,
          price: item.price,
        });
      }
      return acc;
    }, []);
    const productDetailsMap = {};
    const productIds = aggregatedOrders.map((order) => order.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    products.forEach((product) => {
      productDetailsMap[product._id.toString()] = product;
    });
    const achievements = targets.products
      .flatMap((targetProduct) => {
        const matchingOrders = aggregatedOrders.filter(
          (order) => order.productId === targetProduct.productId
        );
        if (matchingOrders.length > 0) {
          const actualQuantity = matchingOrders.reduce(
            (total, order) => total + order.qty,
            0
          );
          const actualTotalPrice = matchingOrders.reduce(
            (total, order) => total + order.qty * order.price,
            0
          );
          const productDetails =
            productDetailsMap[targetProduct.productId.toString()] || {};
          return {
            productId: productDetails,
            targetQuantity: targetProduct.qtyAssign,
            actualQuantity: actualQuantity,
            achievementPercentage:
              (actualQuantity / targetProduct.qtyAssign) * 100,
            productPrice: targetProduct.price,
            targetTotalPrice: targetProduct.totalPrice,
            actualTotalPrice: actualTotalPrice,
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const overallTargetQuantity = targets.products.reduce(
      (total, targetProduct) => total + targetProduct.qtyAssign,
      0
    );
    const overallActualQuantity = achievements.reduce(
      (total, achievement) => total + achievement.actualQuantity,
      0
    );
    const overallAchievementPercentage =
      (overallActualQuantity / overallTargetQuantity) * 100;

    user.overallAchievementPercentage = overallAchievementPercentage;
    return res
      .status(200)
      .json({ user, achievements, overallAchievementPercentage, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};
export const latestAchievementSalesById555 = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findOne({
      _id: userId,
      database: req.params.database,
      status: "Active",
    });
    if (user.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    const customer = await Customer.find({
      created_by: user._id,
      status: "Active",
    }).sort({ sortorder: -1 });
    if (customer.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    let salesPerson = [];
    for (let item of customer) {
      const customer = await Customer.findById({
        _id: item._id,
        status: "Active",
      }).sort({ sortorder: -1 });
      const startDate = req.body.startDate
        ? new Date(req.body.startDate)
        : null;
      const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

      const targetQuery = { partyId: item._id };
      if (startDate && endDate) {
        targetQuery.createdAt = { $gte: startDate, $lte: endDate };
        // targetQuery.startDate = { $gte: startDate };
        // targetQuery.endDate = { $lte: endDate };
      }
      const targetss = await TargetCreation.find(targetQuery)
        .populate({ path: "partyId", model: "customer" })
        .sort({ sortorder: -1 });
      const targets = targetss[targetss.length - 1];
      if (targetss.length === 0) {
        continue;
        // return res.status(404).json({ message: "Not Found", status: false });
      }
      const orders = await CreateOrder.find({ partyId: targets.partyId });
      if (!orders || orders.length === 0) {
        continue;
        // return res.status(404).json({ message: "Order Not Found", status: false });
      }
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productDetailsMap = {};
      productDetailsMap.partyName = targets?.partyId?.ownerName;
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      products.forEach((product) => {
        productDetailsMap[product._id.toString()] = product;
      });
      const achievements = targets.products
        .flatMap((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              productPrice: targetProduct.price,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean);
      const overallTargetQuantity = targets.products.reduce(
        (total, targetProduct) => total + targetProduct.qtyAssign,
        0
      );
      const overallActualQuantity = achievements.reduce(
        (total, achievement) => total + achievement.actualQuantity,
        0
      );
      const overallAchievementPercentage =
        (overallActualQuantity / overallTargetQuantity) * 100;
      salesPerson.push({ customer, achievements });
    }
    return res.status(200).json({ salesPerson, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const latestAchievementSalesById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findOne({
      _id: userId,
      database: req.params.database,
      status: "Active",
    });
    if (!user) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    // const customer = await Customer.find({ created_by: user._id, status: "Active" }).sort({ sortorder: -1 })
    // if (customer.length === 0) {
    //     return res.status(404).json({ message: "Not Found", status: false });
    // }
    let salesPerson = [];
    // for (let item of customer) {
    // const customer = await Customer.findById({ _id: item._id, status: "Active" }).sort({ sortorder: -1 })
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const targetQuery = { userId: user._id };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
      // targetQuery.startDate = { $gte: startDate };
      // targetQuery.endDate = { $lte: endDate };
    }
    const targetss = await TargetCreation.find(targetQuery)
      .populate({ path: "userId", model: "user" })
      .sort({ sortorder: -1 });
    const targets = targetss[targetss.length - 1];
    if (targetss.length === 0) {
      console.log("targer not found");
      // continue;
      return res
        .status(404)
        .json({ message: "Target Not Found", status: false });
    }
    const orders = await CreateOrder.find({ userId: targets.userId });
    if (!orders || orders.length === 0) {
      console.log("order not found");
      // continue;
      return res
        .status(404)
        .json({ message: "Order Not Found", status: false });
    }
    const allOrderItems = orders.flatMap((order) => order.orderItems);
    const aggregatedOrders = allOrderItems.reduce((acc, item) => {
      const existingItem = acc.find(
        (accItem) =>
          accItem.productId.toString() === item.productId._id.toString()
      );
      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.price += item.price;
      } else {
        acc.push({
          productId: item.productId._id.toString(),
          qty: item.qty,
          price: item.price,
        });
      }
      return acc;
    }, []);
    const productDetailsMap = {};
    productDetailsMap.userName = targets?.userId?.firstName;
    const productIds = aggregatedOrders.map((order) => order.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    products.forEach((product) => {
      productDetailsMap[product._id.toString()] = product;
    });
    const achievements = targets.products
      .flatMap((targetProduct) => {
        const matchingOrders = aggregatedOrders.filter(
          (order) => order.productId === targetProduct.productId
        );
        if (matchingOrders.length > 0) {
          const actualQuantity = matchingOrders.reduce(
            (total, order) => total + order.qty,
            0
          );
          const actualTotalPrice = matchingOrders.reduce(
            (total, order) => total + order.qty * order.price,
            0
          );
          const productDetails =
            productDetailsMap[targetProduct.productId.toString()] || {};
          return {
            productId: productDetails,
            targetQuantity: targetProduct.qtyAssign,
            actualQuantity: actualQuantity,
            achievementPercentage:
              (actualQuantity / targetProduct.qtyAssign) * 100,
            productPrice: targetProduct.price,
            targetTotalPrice:
              targetProduct.qtyAssign * productDetails.Product_MRP, //targetProduct.totalPrice,
            actualTotalPrice: actualQuantity * productDetails.Product_MRP, //actualTotalPrice
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const overallTargetQuantity = targets.products.reduce(
      (total, targetProduct) => total + targetProduct.qtyAssign,
      0
    );
    const overallActualQuantity = achievements.reduce(
      (total, achievement) => total + achievement.actualQuantity,
      0
    );
    const overallAchievementPercentage =
      (overallActualQuantity / overallTargetQuantity) * 100;
    salesPerson.push({ achievements });
    // }
    return res.status(200).json({ achievements, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const latestAchievement = async (req, res) => {
  try {
    const customers = await Customer.find({
      database: req.params.database,
      status: "Active",
    });
    const achievementsByCustomer = [];

    for (let customer of customers) {
      const startDate = req.body.startDate
        ? new Date(req.body.startDate)
        : null;
      const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

      const targetQuery = { partyId: customer._id };
      if (startDate && endDate) {
        targetQuery.createdAt = { $gte: startDate, $lte: endDate };
        // targetQuery.startDate = { $gte: startDate };
        // targetQuery.endDate = { $lte: endDate };
      }

      const targets = await TargetCreation.findOne(targetQuery).populate({
        path: "partyId",
        model: "customer",
      });
      if (!targets) {
        continue;
      }
      const orders = await CreateOrder.find({ partyId: targets.partyId });
      if (!orders || orders.length === 0) {
        continue;
      }
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productDetailsMap = {};
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      products.forEach((product) => {
        productDetailsMap[product._id.toString()] = product;
      });
      const achievements = targets.products
        .flatMap((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              productPrice: targetProduct.price,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean);

      const overallTargetQuantity = targets.products.reduce(
        (total, targetProduct) => total + targetProduct.qtyAssign,
        0
      );
      const overallActualQuantity = achievements.reduce(
        (total, achievement) => total + achievement.actualQuantity,
        0
      );
      const overallAchievementPercentage =
        (overallActualQuantity / overallTargetQuantity) * 100;

      achievementsByCustomer.push({
        overallAchievementPercentage,
        partyId: customer._id,
        achievements,
      });
    }

    return res.status(200).json({ achievementsByCustomer, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

// right-1
export const called = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const result = await getUserHierarchyBottomToTop2(
      userId,
      database,
      req.body
    );
    const flattenedArray = flattenNestedArray(result);
    const targetQuery = { userId: userId };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
      // targetQuery.startDate = { $gte: startDate };
      // targetQuery.endDate = { $lte: endDate };
    }
    const targetss = await TargetCreation.find(targetQuery).sort({
      sortorder: -1,
    });
    const targets = targetss[targetss.length - 1];
    if (targetss.length === 0) {
      return res
        .status(404)
        .json({ message: "Target Not Found", status: false });
    }
    const totalAchievementPrice = flattenedArray.reduce((total, price) => {
      return total + price.actualTotalPrice;
    }, 0);
    // const totalTargetPrice = flattenedArray.reduce((total, price) => {
    //     return total + price.targetTotalPrice
    // }, 0)
    let totalTargetPrice;
    let TargetAchievement = {
      totalTargetPrice: targets.grandTotal,
      totalAchievementPrice,
      overAllPercentage: (
        (totalAchievementPrice * 100) /
        targets.grandTotal
      ).toFixed(2),
    };
    return res.status(200).json({ TargetAchievement, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// 2
const flattenNestedArray = (arr) => {
  return arr.reduce((acc, val) => {
    if (Array.isArray(val) && val.length > 0) {
      return acc.concat(flattenNestedArray(val));
    } else {
      return acc.concat(val);
    }
  }, []);
};
// 3
const latestAchievement1 = async (body, data) => {
  try {
    const customer = await User.find({ created_by: body });
    let latestAchieve = [];
    for (let id of customer) {
      // const targets1 = await TargetCreation.findOne({ partyId: id._id });
      // if (!targets1) {
      //     continue;
      // }
      const startDate = data.startDate ? new Date(data.startDate) : null;
      const endDate = data.endDate ? new Date(data.endDate) : null;
      const targetQuery = { userId: id._id, salesPersonId: "salesPerson" };
      if (startDate && endDate) {
        targetQuery.createdAt = { $gte: startDate, $lte: endDate };
        // targetQuery.startDate = { $gte: startDate };
        // targetQuery.endDate = { $lte: endDate };
      }
      const targetss = await TargetCreation.find(targetQuery).sort({
        sortorder: -1,
      });
      const targets = targetss[targetss.length - 1];
      if (targetss.length === 0) {
        continue;
        // return res.status(404).json({ message: "Not Found", status: false });
      }
      // const targets = await TargetCreation.findOne(targetQuery);
      // if (!targets) {
      //     continue;
      // }
      const orders = await CreateOrder.find({ userId: targets.userId });
      if (!orders || orders.length === 0) {
        continue;
      }
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productDetailsMap = {};
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      products.forEach((product) => {
        productDetailsMap[product._id.toString()] = product;
      });
      const achievements = targets.products
        .flatMap((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean);
      const overallTargetQuantity = targets.products.reduce(
        (total, targetProduct) => total + targetProduct.qtyAssign,
        0
      );
      const overallActualQuantity = achievements.reduce(
        (total, achievement) => total + achievement.actualQuantity,
        0
      );
      const overallAchievementPercentage =
        (overallActualQuantity / overallTargetQuantity) * 100;

      latestAchieve = [...latestAchieve, ...achievements];
    }
    // console.log(achievements.products.detail.Size)
    return latestAchieve;
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};
// 4
const getUserHierarchyBottomToTop2 =
  async function getUserHierarchyBottomToTop2(
    parentId,
    database,
    body,
    processedIds = new Set()
  ) {
    try {
      if (processedIds.has(parentId)) {
        return [];
      }
      processedIds.add(parentId);
      const users = await User.find({
        created_by: parentId,
        database: `${database}`,
        status: "Active",
      }).lean();
      const subUserIds = users.map((user) => user._id);
      const achievement = await latestAchievement1(parentId, body);
      const subResultsPromises = subUserIds.map((userId) =>
        getUserHierarchyBottomToTop2(userId, database, body, processedIds)
      );
      const subResults = await Promise.all(subResultsPromises);
      return [...achievement, ...subResults];
    } catch (error) {
      console.error("Error in getUserHierarchy:", error);
      throw error;
    }
  };

// export const yes = async (req, res, next) => {
//     try {
//         let storedData = [];
//         const newParty = await Customer.find({ created_by: "65a101da103bf4d6762c209d" }).sort({ sortorder: -1 });
//         if (!newParty.length > 0) {
//             console.log(`party not found`);
//         }
//         for (let item of newParty) {
//             const target = await TargetCreation.find({ partyId: item._id }).sort({ sortorder: -1 });
//             const lastTarget = target[target.length - 1];
//             if (lastTarget) {
//                 const dd = await salesPerson(lastTarget.products, storedData.slice());
//                 storedData = dd;
//             }
//         }
//         return res.status(200).json({ storedData, status: true });
//     } catch (err) {
//         console.log(err);
//     }
// };

// ---------------------------------------------------------------------------------------

// final party and salerPerson targetAchievement

export const checkTarget = async (req, res) => {
  try {
    const party = await Customer.findById(req.params.id);
    if (party) {
      const target = await latestAchievement2(
        req.body,
        req.params.id,
        req.params.database
      );
      return res.send(target);
    }
    const customer = await Customer.find({
      created_by: req.params.id,
      database: req.params.database,
    });
    let latestAchieve = [];
    for (let id of customer) {
      const startDate = req.body.startDate
        ? new Date(req.body.startDate)
        : null;
      const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

      const targetQuery = { partyId: id._id };
      if (startDate && endDate) {
        targetQuery.createdAt = { $gte: startDate, $lte: endDate };
        // targetQuery.startDate = { $gte: startDate };
        // targetQuery.endDate = { $lte: endDate };
      }

      const targetss = await TargetCreation.find(targetQuery);
      const targets = targetss[targetss.length - 1];
      if (targetss.length === 0) {
        continue;
        // return res.status(404).json({ error: 'Targets not found', status: false });
      }
      const orders = await CreateOrder.find({ partyId: targets.partyId });
      if (!orders || orders.length === 0) {
        continue;
        // return res.status(404).json({ error: 'Orders not found', status: false });
      }
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productDetailsMap = {};
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      products.forEach((product) => {
        productDetailsMap[product._id.toString()] = product;
      });
      const achievements = targets.products
        .flatMap((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean);
      const overallTargetQuantity = targets.products.reduce(
        (total, targetProduct) => total + targetProduct.qtyAssign,
        0
      );
      const overallActualQuantity = achievements.reduce(
        (total, achievement) => total + achievement.actualQuantity,
        0
      );
      const overallAchievementPercentage =
        (overallActualQuantity / overallTargetQuantity) * 100;

      latestAchieve = [...latestAchieve, ...achievements];
    }
    // console.log(achievements.products.detail.Size)
    return res.status(200).json({ latestAchieve, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const latestAchievement2 = async (body, id, database) => {
  try {
    const partyId = id;
    const targets1 = await TargetCreation.findOne({
      partyId: id,
      database: database,
    });
    if (!targets1) {
      // return res.status(404).json({ message: "Not Found", status: false });
    }

    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;

    const targetQuery = { partyId: partyId };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
      // targetQuery.startDate = { $gte: startDate };
      // targetQuery.endDate = { $lte: endDate };
    }

    const targetss = await TargetCreation.find(targetQuery);
    const targets = targetss[targetss.length - 1];
    if (targetss.length === 0) {
      // return res.status(404).json({ error: 'Targets not found', status: false });
    }
    const orders = await CreateOrder.find({ partyId: targets.partyId });
    if (!orders || orders.length === 0) {
      // return res.status(404).json({ error: 'Orders not found', status: false });
    }
    const allOrderItems = orders.flatMap((order) => order.orderItems);
    const aggregatedOrders = allOrderItems.reduce((acc, item) => {
      const existingItem = acc.find(
        (accItem) =>
          accItem.productId.toString() === item.productId._id.toString()
      );
      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.price += item.price;
      } else {
        acc.push({
          productId: item.productId._id.toString(),
          qty: item.qty,
          price: item.price,
        });
      }
      return acc;
    }, []);
    const productDetailsMap = {};
    const productIds = aggregatedOrders.map((order) => order.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    products.forEach((product) => {
      productDetailsMap[product._id.toString()] = product;
    });
    const achievements = targets.products
      .flatMap((targetProduct) => {
        const matchingOrders = aggregatedOrders.filter(
          (order) => order.productId === targetProduct.productId
        );
        if (matchingOrders.length > 0) {
          const actualQuantity = matchingOrders.reduce(
            (total, order) => total + order.qty,
            0
          );
          const actualTotalPrice = matchingOrders.reduce(
            (total, order) => total + order.qty * order.price,
            0
          );
          const productDetails =
            productDetailsMap[targetProduct.productId.toString()] || {};
          return {
            productId: productDetails,
            targetQuantity: targetProduct.qtyAssign,
            actualQuantity: actualQuantity,
            achievementPercentage:
              (actualQuantity / targetProduct.qtyAssign) * 100,
            targetTotalPrice: targetProduct.price,
            actualTotalPrice: actualTotalPrice,
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const overallTargetQuantity = targets.products.reduce(
      (total, targetProduct) => total + targetProduct.qtyAssign,
      0
    );
    const overallActualQuantity = achievements.reduce(
      (total, achievement) => total + achievement.actualQuantity,
      0
    );
    const overallAchievementPercentage =
      (overallActualQuantity / overallTargetQuantity) * 100;
    // console.log(achievements.products.detail.Size)
    return achievements;
  } catch (error) {
    console.error("Error calculating achievements:", error);
    // res.status(500).json({ error: 'Internal Server Error', status: false });
  }
};

// ---------------------------------------------------------------------------------------

// save target customer

// Helper: normalize numbers safely
const number = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const SavePartyTarget = async (req, res) => {
  const filePath = req.file?.path; // disk storage (multer disk)
  const fileBuffer = req.file?.buffer; // memory storage (multer memory)

  try {
    // ===================== PATH A: Excel file present =====================
    if (filePath || fileBuffer) {
      const workbook = new ExcelJS.Workbook();
      if (fileBuffer) {
        await workbook.xlsx.load(fileBuffer);
      } else {
        await workbook.xlsx.readFile(filePath);
      }

      const worksheet = workbook.getWorksheet(1) || workbook.worksheets?.[0];
      if (!worksheet) {
        return res
          .status(400)
          .json({ message: "Invalid or empty Excel file", status: false });
      }

      // read header row
      const headerRow = worksheet.getRow(1);
      const headings = (headerRow?.values || []).slice(1);

      const groupedData = {};
      const getKey = (row) =>
        `${row.salesPersonId || ""}_${row.partyId || ""}_${
          row.created_by || req.body?.created_by || ""
        }_${row.month || ""}`;

      for (let i = 2; i <= worksheet.actualRowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row) continue;

        const rowData = {};
        headings.forEach((heading, idx) => {
          const cell = row.getCell(idx + 1);
          const value = cell?.value;
          rowData[heading] =
            typeof value === "object" && value?.text ? value.text : value;
        });

        let {
          salesPersonId,
          partyId,
          productId,
          qtyAssign,
          price,
          month,
          percentage, // per-line increment %
          created_by,
        } = rowData;

        // skip empty rows
        if (!partyId && !productId) continue;

        const key = getKey({
          salesPersonId,
          partyId,
          created_by,
          month,
        });

        if (!groupedData[key]) {
          groupedData[key] = {
            salesPersonId: salesPersonId || "",
            partyId: partyId || "",
            created_by: req.body?.created_by || created_by || "",
            date: (month ?? "").toString(),
            products: [],
            // Excel path doesn't include a doc-level incrementPercent; keep per-line only.
            incrementPercent: undefined,
          };
        }

        const q = num(qtyAssign);
        if (q > 0) {
          const pct = num(percentage);
          const prc = num(price);
          const adjustedQty = q + (q * pct) / 100;

          groupedData[key].products.push({
            productId,
            qtyAssign: adjustedQty,
            price: prc,
            totalPrice: adjustedQty * prc,
            assignPercentage: [
              {
                month: (month ?? "").toString(),
                percentage: pct,
              },
            ],
          });
        }
      }

      const savedDocuments = [];

      for (const key in groupedData) {
        const entry = groupedData[key];

        if (!entry.partyId || !entry.products?.length) continue;

        // partyId in sheets might be sId; fallback to _id
        const party =
          (await Customer.findOne({ sId: entry.partyId })) ||
          (await Customer.findById(entry.partyId));

        if (!party) {
          return res.status(404).json({
            message: `Customer with ID ${entry.partyId} not found`,
            status: false,
          });
        }

        entry.database = party.database;
        entry.grandTotal = entry.products.reduce(
          (sum, p) => sum + num(p.totalPrice),
          0
        );

        if (entry.date) {
          // upsert by (partyId + date)
          const existing = await TargetCreation.findOne({
            partyId: entry.partyId,
            date: entry.date,
          });

          if (existing) {
            existing.products = entry.products;
            existing.grandTotal = entry.grandTotal;
            existing.created_by = entry.created_by || existing.created_by;
            existing.salesPersonId =
              entry.salesPersonId || existing.salesPersonId || "";
            // keep incrementPercent if already present; Excel path doesn't override it
            await existing.save();
            savedDocuments.push(existing);
            continue;
          }
        }

        const created = await TargetCreation.create(entry);
        savedDocuments.push(created);
      }

      return res.status(200).json({
        message: `${savedDocuments.length} target(s) processed successfully.`,
        status: true,
        data: savedDocuments,
      });
    }

    // ===================== PATH B: JSON payload (no file) =====================
    // Expected:
    // {
    //   partyId: "<_id or sId>",
    //   products: [{ productId, qtyAssign, price, totalPrice, assignPercentage: [...] }],
    //   created_by: "<user _id>",
    //   grandTotal?: number,
    //   date?: "Sep-2025",
    //   month?: "Sep-2025",       // alias
    //   startDate?: "...", endDate?: "...",
    //   salesPersonId?: "<_id>",  // saved at doc-level
    //   incrementPercent?: number // ✅ NEW: doc-level increment %
    // }
    const {
      partyId,
      products = [],
      created_by,
      grandTotal,
      date,
      month, // alias
      startDate,
      endDate,
      salesPersonId,
      incrementPercent, // ✅ from FE
    } = req.body || {};

    if (!partyId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        message: "Missing required fields (partyId, products) for JSON create",
        status: false,
      });
    }

    // accept both _id and sId for customers
    const party =
      (await Customer.findById(partyId)) ||
      (await Customer.findOne({ sId: partyId }));

    if (!party) {
      return res.status(404).json({
        message: `Customer not found for partyId ${partyId}`,
        status: false,
      });
    }

    const normalizedProducts = products.map((p) => {
      const q = num(p.qtyAssign);
      const pr = num(p.price);
      const tt = p.totalPrice != null ? num(p.totalPrice) : q * pr;
      return {
        productId: p.productId,
        qtyAssign: q,
        price: pr,
        totalPrice: tt,
        assignPercentage: Array.isArray(p.assignPercentage)
          ? p.assignPercentage
          : [],
      };
    });

    const computedGrand = normalizedProducts.reduce(
      (s, p) => s + num(p.totalPrice),
      0
    );

    const payload = {
      partyId,
      products: normalizedProducts,
      created_by,
      database: party.database,
      grandTotal: grandTotal != null ? num(grandTotal) : computedGrand,
      date: date || month || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      salesPersonId: salesPersonId || "",
      incrementPercent:
        incrementPercent != null ? num(incrementPercent) : undefined, // ✅ store
    };

    if (payload.date) {
      // upsert by (partyId + date)
      const existing = await TargetCreation.findOne({
        partyId: payload.partyId,
        date: payload.date,
      });

      if (existing) {
        existing.products = payload.products;
        existing.grandTotal = payload.grandTotal;
        existing.created_by = payload.created_by || existing.created_by;
        existing.startDate = payload.startDate || existing.startDate;
        existing.endDate = payload.endDate || existing.endDate;
        existing.salesPersonId =
          payload.salesPersonId || existing.salesPersonId || "";
        if (payload.incrementPercent !== undefined) {
          existing.incrementPercent = payload.incrementPercent; // ✅ update/save %
        }
        await existing.save();

        return res.status(200).json({
          message: "Target updated successfully",
          status: true,
          data: existing,
        });
      }
    }

    const created = await TargetCreation.create(payload);
    return res.status(200).json({
      message: "Target saved successfully",
      status: true,
      data: created,
    });
  } catch (error) {
    console.error("Error saving party targets:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
    });
  } finally {
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (e) {
        console.error("File deletion error:", e);
      }
    }
  }
};

const monthNamesFull = [
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
];

const buildFYMonths2 = (fyStartYear) => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const mIndex = (3 + i) % 12; // April=3
    const year = fyStartYear + (mIndex < 3 ? 1 : 0);
    out.push({
      year,
      month: mIndex + 1, // 1-12
      label: `${monthNamesFull[mIndex]}-${year}`,
      key: `m_${year}_${mIndex}`,
    });
  }
  return out;
};

const prevMonth = (year, month /*1-12*/) => {
  const m = month - 1;
  if (m < 1)
    return {
      year: year - 1,
      month: 12,
      label: `${monthNamesFull[11]}-${year - 1}`,
    };
  return { year, month: m, label: `${monthNamesFull[m - 1]}-${year}` };
};

const buildProdKey = (p) => {
  // prefer productDetails.sId -> then productId
  return String(p?.productDetails?.sId || p?.productId || "");
};

const getPartyKey = (partyId) => {
  if (!partyId) return "";
  if (typeof partyId === "object") {
    return String(partyId?.sId || partyId?._id || partyId?.id || "");
  }
  return String(partyId);
};

const amountFromItem = (it) => {
  const direct =
    it?.amount ??
    it?.lineAmount ??
    it?.lineTotal ??
    it?.total ??
    it?.Total ??
    null;
  if (direct != null) return num(direct);
  const qty = num(it?.qty || it?.quantity);
  const price = num(it?.rate || it?.price || it?.mrp || it?.SalesRate || 0);
  return qty * price;
};

// ---------- 1) FY summary (months grandTotal) ----------
export const fySummaryForSalesperson = async (req, res) => {
  try {
    const { salesPersonId, fyStartYear } = req.body || req.query || {};
    if (!salesPersonId || !fyStartYear)
      return res.status(400).json({
        status: false,
        message: "salesPersonId, fyStartYear required",
      });

    const months = buildFYMonths2(Number(fyStartYear));

    const labels = months.map((m) => m.label);

    const docs = await TargetCreation.find({
      salesPersonId: salesPersonId,
      date: { $in: labels },
    }).lean();

    const byLabel = new Map();
    labels.forEach((l) => byLabel.set(l, 0));

    for (const d of docs) {
      const gt = num(d?.grandTotal);
      const lab = String(d?.date || "");
      if (byLabel.has(lab)) byLabel.set(lab, byLabel.get(lab) + gt);
    }

    const out = months.map((m) => ({
      key: m.key,
      label: m.label,
      year: m.year,
      month: m.month,
      grandTotal: byLabel.get(m.label) || 0,
    }));

    return res.json({ status: true, months: out });
  } catch (e) {
    console.error("[fySummaryForSalesperson]", e);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// Collect order achievements for (partyIds[], year, month)
const collectAchievements = async (partyIdSet, year, month /*1-12*/) => {
  const out = new Map(); // prodKey -> {qty, amount}
  const list = await OrderHistory.find({
    status: { $ne: "Deactive" },
  }).lean();

  for (const ord of list || []) {
    const st = String(ord?.status || "").toLowerCase();
    if (st && st !== "completed") continue;

    const d = ord?.date ? new Date(ord.date) : null;
    if (!d || d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;

    const partyKey = String(
      ord?.partyId?.sId ||
        ord?.partyId ||
        ord?.party?.sId ||
        ord?.customer?.sId ||
        ""
    );
    if (!partyKey || !partyIdSet.has(partyKey)) continue;

    for (const it of ord?.orderItems || []) {
      const pKey = String(
        it?.productId?.sId || it?.productSId || it?.productId || ""
      );
      if (!pKey) continue;
      const qty = num(it?.qty || it?.quantity);
      const amt = amountFromItem(it);
      const prev = out.get(pKey) || { qty: 0, amount: 0 };
      out.set(pKey, { qty: prev.qty + qty, amount: prev.amount + amt });
    }
  }
  return out;
};

// ---------- 2) Month metrics (product rows) ----------
export const monthMetricsForSalesperson = async (req, res) => {
  try {
    const { salesPersonId, fyStartYear, year, month } = req.body || {};
    if (!salesPersonId || !year || !month)
      return res.status(400).json({
        status: false,
        message: "salesPersonId, year, month required",
      });

    const fy = Number(fyStartYear) || (month >= 4 ? year : year - 1);
    const months = buildFYMonths2(fy);
    const labelNow = `${monthNamesFull[month - 1]}-${year}`;
    const { year: py, month: pm, label: labelPrev } = prevMonth(year, month);
    const fyLabels = months.map((m) => m.label);

    // All targets for this SP in FY
    const docsFY = await TargetCreation.find({
      salesPersonId: salesPersonId,
      date: { $in: fyLabels },
    }).lean();

    // Partition by label
    const groupByLabel = (docs) => {
      const m = new Map();
      for (const d of docs) {
        const lab = String(d?.date || "");
        if (!m.has(lab)) m.set(lab, []);
        m.get(lab).push(d);
      }
      return m;
    };
    const byLabel = groupByLabel(docsFY);

    const docsNow = byLabel.get(labelNow) || [];
    const docsPrev = byLabel.get(labelPrev) || [];

    // Set of partyIds in current month (for achievements & breakdown)
    const partyIdsNow = new Set(
      docsNow.map((d) => getPartyKey(d?.partyId)).filter(Boolean)
    );

    // Aggregate target by product for: current, prev, FY
    const addProd = (acc, p, useQty = true) => {
      const key = buildProdKey(p);
      if (!key) return;
      const prev = acc.get(key) || {
        qty: 0,
        amount: 0,
        priceSum: 0,
        qtyForAvg: 0,
      };
      const qty = num(p?.qtyAssign);
      const price = num(p?.price);
      const amt = p?.totalPrice != null ? num(p.totalPrice) : qty * price;
      acc.set(key, {
        qty: prev.qty + qty,
        amount: prev.amount + amt,
        priceSum: prev.priceSum + price * qty,
        qtyForAvg: prev.qtyForAvg + qty,
      });
    };

    const aggProducts = (docs) => {
      const map = new Map();
      for (const d of docs) {
        for (const p of d?.products || []) addProd(map, p);
      }
      return map;
    };

    const mapNow = aggProducts(docsNow);
    const mapPrev = aggProducts(docsPrev);
    const mapFY = aggProducts(docsFY);

    // Achievements
    const achNow = await collectAchievements(
      partyIdsNow,
      Number(year),
      Number(month)
    );
    const achPrev = await collectAchievements(
      new Set(docsPrev.map((d) => getPartyKey(d?.partyId)).filter(Boolean)),
      Number(py),
      Number(pm)
    );

    // FY achievements: all parties in FY docs
    const partyIdsFY = new Set(
      docsFY.map((d) => getPartyKey(d?.partyId)).filter(Boolean)
    );
    const achFY = await collectAchievements(
      partyIdsFY,
      null, // we'll aggregate across all FY months below
      null
    );

    // If we didn't filter by month, achFY above will be empty — so we compute FY achievements by looping months:
    const achFYMap = new Map();
    for (const m of months) {
      const ach = await collectAchievements(partyIdsFY, m.year, m.month);
      for (const [k, v] of ach.entries()) {
        const prev = achFYMap.get(k) || { qty: 0, amount: 0 };
        achFYMap.set(k, {
          qty: prev.qty + v.qty,
          amount: prev.amount + v.amount,
        });
      }
    }

    // compose rows (product-wise)
    const keys = new Set([
      ...mapNow.keys(),
      ...mapPrev.keys(),
      ...mapFY.keys(),
      ...achNow.keys(),
      ...achPrev.keys(),
      ...achFYMap.keys(),
    ]);

    const rows = [];
    for (const k of keys) {
      const n = mapNow.get(k) || {
        qty: 0,
        amount: 0,
        priceSum: 0,
        qtyForAvg: 0,
      };
      const p = mapPrev.get(k) || {
        qty: 0,
        amount: 0,
        priceSum: 0,
        qtyForAvg: 0,
      };
      const y = mapFY.get(k) || {
        qty: 0,
        amount: 0,
        priceSum: 0,
        qtyForAvg: 0,
      };

      const price =
        n.qtyForAvg > 0
          ? n.priceSum / n.qtyForAvg
          : y.qtyForAvg > 0
          ? y.priceSum / y.qtyForAvg
          : 0;

      const aNow = achNow.get(k) || { qty: 0, amount: 0 };
      const aPrev = achPrev.get(k) || { qty: 0, amount: 0 };
      const aFY = achFYMap.get(k) || { qty: 0, amount: 0 };

      const cmShort = Math.max(n.amount - aNow.amount, 0);
      const lmShort = Math.max(p.amount - aPrev.amount, 0);
      const yShort = Math.max(y.amount - aFY.amount, 0);

      rows.push({
        productId: k,
        productName: "", // let client resolve if needed
        targetQty: n.qty,
        salePrice: Number(price.toFixed(2)),
        productTotal: n.amount,

        cmTarget: n.amount,
        lmTarget: p.amount,
        yTarget: y.amount,

        cmAch: aNow.amount,
        lmAch: aPrev.amount,
        yAch: aFY.amount,

        cmShort,
        lmShort,
        yShort,
      });
    }

    // sort by productName/Id for stable output
    rows.sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

    return res.json({ status: true, rows });
  } catch (e) {
    console.error("[monthMetricsForSalesperson]", e);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// ---------- 3) Product -> customer breakdown ----------
export const productBreakdownForSalesperson = async (req, res) => {
  try {
    const { salesPersonId, year, month, productId } = req.body || {};
    if (!salesPersonId || !year || !month || !productId)
      return res.status(400).json({
        status: false,
        message: "salesPersonId, year, month, productId required",
      });

    const labelNow = `${monthNamesFull[month - 1]}-${year}`;
    const { year: py, month: pm } = prevMonth(year, month);
    const labelPrev = `${monthNamesFull[pm - 1]}-${py}`;

    // month targets for this SP + product
    const docsNow = await TargetCreation.find({
      salesPersonId: salesPersonId,
      date: labelNow,
      products: { $exists: true, $ne: [] },
    }).lean();

    // parties in this SP/month
    const partyIds = [];
    const perPartyTarget = new Map(); // partyKey -> target obj for this product
    for (const d of docsNow) {
      const partyKey = getPartyKey(d?.partyId);
      if (!partyKey) continue;
      partyIds.push(partyKey);
      for (const p of d?.products || []) {
        const k = buildProdKey(p);
        if (String(k) !== String(productId)) continue;
        const qty = num(p?.qtyAssign);
        const price = num(p?.price);
        const amt = p?.totalPrice != null ? num(p.totalPrice) : qty * price;
        const prev = perPartyTarget.get(partyKey) || {
          qty: 0,
          amt: 0,
          price: 0,
        };
        perPartyTarget.set(partyKey, {
          qty: prev.qty + qty,
          amt: prev.amt + amt,
          price: price || prev.price,
        });
      }
    }

    // Resolve party names
    const customers = await Customer.find({
      $or: [{ sId: { $in: partyIds } }, { _id: { $in: partyIds } }],
    }).lean();
    const partyNameMap = new Map();
    for (const c of customers) {
      const key = String(c?.sId || c?._id);
      partyNameMap.set(key, c?.CompanyName || c?.companyName || key);
    }

    // Achievements month (per party/product)
    const achieveFor = async (y, m) => {
      const out = new Map(); // partyKey -> { qty, amt }
      const orders = await OrderHistory.find({
        status: { $ne: "Deactive" },
      }).lean();

      for (const ord of orders || []) {
        const st = String(ord?.status || "").toLowerCase();
        if (st && st !== "completed") continue;

        const d = ord?.date ? new Date(ord.date) : null;
        if (!d || d.getFullYear() !== y || d.getMonth() + 1 !== m) continue;

        const partyKey = String(
          ord?.partyId?.sId ||
            ord?.partyId ||
            ord?.party?.sId ||
            ord?.customer?.sId ||
            ""
        );
        if (!partyKey || !perPartyTarget.has(partyKey)) continue;

        for (const it of ord?.orderItems || []) {
          const k = String(
            it?.productId?.sId || it?.productSId || it?.productId || ""
          );
          if (String(k) !== String(productId)) continue;
          const qty = num(it?.qty || it?.quantity);
          const amt = amountFromItem(it);
          const prev = out.get(partyKey) || { qty: 0, amt: 0 };
          out.set(partyKey, { qty: prev.qty + qty, amt: prev.amt + amt });
        }
      }
      return out;
    };

    const achNow = await achieveFor(Number(year), Number(month));

    // previous month target/achievements for last-month shortfall
    const docsPrev = await TargetCreation.find({
      salesPersonId: salesPersonId,
      date: labelPrev,
      products: { $exists: true, $ne: [] },
    }).lean();

    const perPartyPrevTarget = new Map(); // partyKey -> {qty, amt, price}
    for (const d of docsPrev) {
      const partyKey = getPartyKey(d?.partyId);
      if (!partyKey) continue;
      for (const p of d?.products || []) {
        const k = buildProdKey(p);
        if (String(k) !== String(productId)) continue;
        const qty = num(p?.qtyAssign);
        const price = num(p?.price);
        const amt = p?.totalPrice != null ? num(p.totalPrice) : qty * price;
        const prev = perPartyPrevTarget.get(partyKey) || {
          qty: 0,
          amt: 0,
          price: 0,
        };
        perPartyPrevTarget.set(partyKey, {
          qty: prev.qty + qty,
          amt: prev.amt + amt,
          price: price || prev.price,
        });
      }
    }
    const achPrev = await achieveFor(Number(py), Number(pm));

    // Compose rows per party
    const customersOut = [];
    for (const [partyKey, t] of perPartyTarget.entries()) {
      const name = partyNameMap.get(partyKey) || partyKey;
      const a = achNow.get(partyKey) || { qty: 0, amt: 0 };

      const shortQty = Math.max(num(t.qty) - num(a.qty), 0);
      const price = t.price || (num(t.qty) ? num(t.amt) / num(t.qty) : 0);
      const shortAmt = shortQty * price;

      const pT = perPartyPrevTarget.get(partyKey) || { qty: 0, amt: 0, price };
      const pA = achPrev.get(partyKey) || { qty: 0, amt: 0 };
      const prevShortQty = Math.max(num(pT.qty) - num(pA.qty), 0);
      const prevShortAmt = prevShortQty * (pT.price || price);

      customersOut.push({
        partyId: partyKey,
        partyName: name,
        targetQty: num(t.qty),
        targetAmt: num(t.amt),
        achievedQty: num(a.qty),
        achievedAmt: num(a.amt),
        shortfallQty: shortQty,
        shortfallAmt: shortAmt,
        lastMonthShortfallQty: prevShortQty,
        lastMonthShortfallAmt: prevShortAmt,
      });
    }

    customersOut.sort((a, b) =>
      String(a.partyName).localeCompare(String(b.partyName))
    );

    return res.json({ status: true, customers: customersOut });
  } catch (e) {
    console.error("[productBreakdownForSalesperson]", e);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// export const SavePartyTarget = async (req, res) => {
//     try {
//         const party = await Customer.findById(req.body.partyId);
//         if (!party) {
//             return res.status(404).json({ message: "Customer Not Found", status: false })
//         }
//         req.body.database = party.database
//         const target = await TargetCreation.create(req.body);
//         return res.status(200).json({ message: "Target saved successfully", status: true });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: "Internal Server Error", status: false });
//     }
// };
// view party target

export const ViewPartyTarget = async (req, res, next) => {
  try {
    const targets = await TargetCreation.find({
      database: req.params.database,
      partyId: { $ne: null },
    })
      .populate({ path: "created_by", model: "user" })
      .lean();

    if (targets.length === 0) {
      return res
        .status(404)
        .json({ message: "Target not found", status: false });
    }

    const partyIds = [...new Set(targets.map((t) => t.partyId))];

    const productIds = [
      ...new Set(
        targets.flatMap((t) => t.products?.map((p) => p.productId) || [])
      ),
    ];

    const products = await Product.find({ sId: { $in: productIds } }).lean();
    const customers = await Customer.find({ sId: { $in: partyIds } }).lean();

    const productMap = {};
    const customerMap = {};

    products.forEach((product) => {
      productMap[product.sId] = product;
    });

    customers.forEach((customer) => {
      customerMap[customer.sId] = customer;
    });

    const enrichedTargets = targets.map((target) => {
      const enrichedProducts =
        target.products?.map((prod) => ({
          ...prod,
          productDetails: productMap[prod.productId] || null,
        })) || [];

      return {
        ...target,
        customer: customerMap[target.partyId] || null,
        products: enrichedProducts,
      };
    });

    return res.status(200).json({
      message: "Target data fetched successfully",
      status: true,
      data: enrichedTargets,
    });
  } catch (err) {
    console.error("Error in ViewPartyTarget:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// export const ViewPartyTarget = async (req, res, next) => {
//     try {
//         const party = await TargetCreation.find({ database: req.params.database, partyId: { $ne: null } }).populate({path:"partyId",model:"customer"})
//         if (party.length === 0) {
//             return res.status(404).json({ message: "target not found", status: false })
//         }
//         return res.status(200).json({ TargetCreation: party, status: true })
//     }
//     catch (err) {
//         console.log(err)
//         return res.status(500).json({ error: "Internal Server Error", status: false })
//     }
// }

export const targetCalculation = async (req, res, next) => {
  try {
    let Target = {
      currentMonthTarget: 0,
      currentMonthAchieve: 0,
      targerPending: 0,
      averageTarget: 0,
      averageAchievement: 0,
      averagePending: 0,
    };

    const { id, database } = req.params;
    let lastMonthCount = 1;

    const user = await User.findOne({ sId: id, database });
    const customer = !user
      ? await Customer.findOne({ sId: id, database })
      : null;

    let Achievement = [];

    if (user) {
      const role = await Role.findOne({ _id: user.rolename });
      if (!role) {
        return res
          .status(404)
          .json({ message: "Role not found", status: false });
      }

      const roleName = role.roleName;

      if (roleName === "SuperAdmin" || roleName === "Sales Manager") {
        Achievement = await SalesPersonAchievement(database);
      } else if (roleName === "Sales Person") {
        Achievement = await SalesPersonAchievement(
          database,
          user.sId,
          user._id
        );
      } else {
        return res
          .status(403)
          .json({ message: "Access denied for this role", status: false });
      }
    } else if (customer) {
      Achievement = await CustomerTargetAchievement(
        database,
        customer.sId,
        customer._id
      );
    } else {
      return res
        .status(404)
        .json({ message: "User or Customer not found", status: false });
    }

    if (!Achievement || !Achievement[0]?.achievements?.length) {
      return res
        .status(404)
        .json({ message: "Achievement not found", status: false });
    }

    let totalSalesPersons = 0;

    Achievement[0].achievements.forEach((item) => {
      Target.currentMonthTarget += item.totalTarget;
      Target.currentMonthAchieve += item.totalAchieve;
      Target.averageTarget += item.averageTarget;
      Target.averageAchievement += item.averageAchieve;
      totalSalesPersons += 1;
    });

    Target.targerPending =
      Target.currentMonthTarget - Target.currentMonthAchieve > 0
        ? Target.currentMonthTarget - Target.currentMonthAchieve
        : 0;

    lastMonthCount = totalSalesPersons || 1;

    // Target.averageTarget = Target.currentMonthTarget / lastMonthCount;
    // Target.averageAchievement = Target.currentMonthAchieve / lastMonthCount;
    Target.averagePending =
      Target.averageTarget - Target.averageAchievement > 0
        ? Target.averageTarget - Target.averageAchievement
        : 0;

    res.status(200).json({ Target, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const SalesPersonAchievement = async (
  database,
  salesPersonId = null,
  userId = null
) => {
  try {
    const role = await Role.findOne({ database, roleName: "Sales Person" });
    if (!role) return [];

    const query = { rolename: role._id, database, status: "Active" };
    if (salesPersonId) query.sId = salesPersonId;

    const users = await User.find(query);
    if (!users.length) return [];

    const startOfMonth = moment().startOf("month").toDate();
    const endOfMonth = moment().endOf("month").toDate();
    const currentMonthLabel = moment().format("MMM-YYYY");

    const salesPersonPromises = users.map(async (user) => {
      const targetQuery = { salesPersonId: user.sId, date: currentMonthLabel };
      const targetQuery1 = { salesPersonId: user.sId };
      const currentMonthTargetss = await TargetCreation.find(targetQuery).sort({
        sortorder: -1,
      });
      const totalMonthsTargets = await TargetCreation.find(targetQuery1).sort({
        sortorder: -1,
      });
      const uniqueMonths = new Set(totalMonthsTargets.map((t) => t.date));
      const totalMonths = uniqueMonths.size;
      const allTotalTarget = totalMonthsTargets.flatMap(
        (item) => item.products || []
      );
      const allTotalTargetss = allTotalTarget.reduce(
        (sum, o) => sum + (o.totalPrice || 0),
        0
      );
      const allTarget = currentMonthTargetss.flatMap(
        (item) => item.products || []
      );
      const totalTarget = allTarget.reduce(
        (sum, o) => sum + (o.totalPrice || 0),
        0
      );
      const averageTarget = allTotalTargetss / totalMonths;
      const CurrentMothOrders = await CreateOrder.find({
        userId: user._id,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        status: "completed",
      });

      const allOrderItems = CurrentMothOrders.flatMap(
        (order) => order.orderItems || []
      );
      const aggregatedOrders = [];

      for (const item of allOrderItems) {
        const existingItem = aggregatedOrders.find(
          (accItem) => accItem.originalProductId === item.productId.toString()
        );

        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price = item.price;
          existingItem.grandTotal += item.grandTotal;
        } else {
          const findProduct = await Product.findById(item.productId);
          if (findProduct) {
            const pId = `${findProduct.category}-${findProduct.SubCategory}-${findProduct.Product_Title}`;
            aggregatedOrders.push({
              productId: pId,
              originalProductId: item.productId.toString(),
              qty: item.qty,
              price: item.price,
              grandTotal: item.grandTotal,
            });
          }
        }
      }

      const TotalMothOrders = await CreateOrder.find({
        userId: user._id,
        status: "completed",
      });
      const orderMonths = new Set(
        TotalMothOrders.map((order) => moment(order.date).format("MMM-YYYY"))
      );

      const totalOrderMonths = orderMonths.size;
      const allTotalOrderItems = TotalMothOrders.flatMap(
        (order) => order.orderItems || []
      );
      const aggregatedOrderss = [];

      for (const item of allTotalOrderItems) {
        const existingItem = aggregatedOrderss.find(
          (accItem) => accItem.originalProductId === item.productId.toString()
        );

        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price = item.price;
          existingItem.grandTotal += item.grandTotal;
        } else {
          const findProduct = await Product.findById(item.productId);
          if (findProduct) {
            const pId = `${findProduct.category}-${findProduct.SubCategory}-${findProduct.Product_Title}`;
            aggregatedOrderss.push({
              productId: pId,
              originalProductId: item.productId.toString(),
              qty: item.qty,
              price: item.price,
              grandTotal: item.grandTotal,
            });
          }
        }
      }
      const totalsAchieve = aggregatedOrderss.reduce(
        (sum, o) => sum + o.grandTotal,
        0
      );
      const averageAchieve = totalsAchieve / (totalOrderMonths || 1);
      const totalAchieve = aggregatedOrders.reduce(
        (sum, o) => sum + o.grandTotal,
        0
      );
      return {
        totalTarget: totalTarget || 0,
        totalAchieve: totalAchieve || 0,
        averageTarget: averageTarget || 0,
        averageAchieve: averageAchieve || 0,
      };
    });

    const results = (await Promise.all(salesPersonPromises)).filter(Boolean);

    return [
      {
        achievements: results,
      },
    ];
  } catch (err) {
    console.error("Error calculating SalesPersonAchievement:", err);
    return [];
  }
};

// export const SalesPersonAchievement = async (database, salesPersonId=null, userId=null) => {
//   try {
//     const role = await Role.findOne({ database, roleName: "Sales Person" });
//     if (!role) return [];

//     const query = { rolename: role._id, database, status: "Active" };
//     if (salesPersonId) query.sId = salesPersonId;

//     const users = await User.find(query);
//     if (!users.length) return [];

//     const startOfMonth = moment().startOf('month').toDate();
//     const endOfMonth = moment().endOf('month').toDate();
//     const currentMonthLabel = moment().format("MMM-YYYY");

//     const salesPersonPromises = users.map(async (user) => {
//       const targetQuery = { salesPersonId: user.sId, date: currentMonthLabel };
//       const targetss = await TargetCreation.find(targetQuery).sort({ sortorder: -1 });
//       if (!targetss.length) return null;

//       const allTarget = targetss.flatMap((item) => item.products);
//       const totalTarget = allTarget.reduce((sum, o) => sum + o.totalPrice, 0);

//       const orderQuery = {
//         userId: userId,
//         date: { $gte: startOfMonth, $lte: endOfMonth },
//         status: "completed"
//       };

//       const orders = await CreateOrder.find(orderQuery);
//       if (!orders.length) return null;

//       const allOrderItems = orders.flatMap(order => order.orderItems);
//       const aggregatedOrders = [];

//       for (const item of allOrderItems) {
//         const existingItem = aggregatedOrders.find(accItem =>
//           accItem.originalProductId === item.productId.toString()
//         );

//         if (existingItem) {
//           existingItem.qty += item.qty;
//           existingItem.price = item.price;
//           existingItem.grandTotal += item.grandTotal;
//         } else {
//           const findProduct = await Product.findById(item.productId);
//           if (findProduct) {
//             const pId = `${findProduct.category}-${findProduct.SubCategory}-${findProduct.Product_Title}`;
//             aggregatedOrders.push({
//               productId: pId,
//               originalProductId: item.productId.toString(),
//               qty: item.qty,
//               price: item.price,
//               grandTotal: item.grandTotal
//             });
//           }
//         }
//       }

//       const totalAchieve = aggregatedOrders.reduce((sum, o) => sum + o.grandTotal, 0);

//       return {
//         totalTarget,
//         totalAchieve,
//       };
//     });

//     const results = (await Promise.all(salesPersonPromises)).filter(Boolean);

//     return [{
//       achievements: results
//     }];

//   } catch (err) {
//     console.error("Error calculating SalesPersonAchievement:", err);
//     return [];
//   }
// };

export const CustomerTargetAchievement = async (
  database,
  partyId,
  customerId
) => {
  try {
    const currentMonthLabel = moment().format("MMM-YYYY");
    const startOfMonth = moment().startOf("month").toDate();
    const endOfMonth = moment().endOf("month").toDate();

    const allTargets = await TargetCreation.find({ partyId, database });

    const uniqueTargetMonths = new Set(allTargets.map((t) => t.date));
    const countTargetMonths = uniqueTargetMonths.size || 1;

    const allProducts = allTargets.flatMap((t) => t.products || []);
    const totalAllTargets = allProducts.reduce(
      (sum, p) => sum + (p.totalPrice || 0),
      0
    );
    const averageTarget = totalAllTargets / countTargetMonths;

    const currentMonthTargets = allTargets.filter(
      (t) => t.date === currentMonthLabel
    );
    const currentMonthProducts = currentMonthTargets.flatMap(
      (t) => t.products || []
    );
    const totalTarget = currentMonthProducts.reduce(
      (sum, p) => sum + (p.totalPrice || 0),
      0
    );

    const allOrders = await CreateOrder.find({
      partyId: customerId,
      status: "completed",
      database,
    });

    const orderMonths = new Set(
      allOrders.map((o) => moment(o.date).format("MMM-YYYY"))
    );
    const countOrderMonths = orderMonths.size || 1;

    const allOrderItems = allOrders.flatMap((o) => o.orderItems || []);
    const totalAllAchieve = allOrderItems.reduce(
      (sum, i) => sum + (i.qty * i.price || 0),
      0
    );
    const averageAchieve = totalAllAchieve / countOrderMonths;

    const currentMonthOrders = allOrders.filter(
      (order) => order.date >= startOfMonth && order.date <= endOfMonth
    );
    const currentOrderItems = currentMonthOrders.flatMap(
      (o) => o.orderItems || []
    );
    const totalAchieve = currentOrderItems.reduce(
      (sum, i) => sum + (i.qty * i.price || 0),
      0
    );

    return [
      {
        achievements: [
          {
            totalTarget: totalTarget || 0,
            totalAchieve: totalAchieve || 0,
            averageTarget: averageTarget || 0,
            averageAchieve: averageAchieve || 0,
            monthCount: countTargetMonths,
          },
        ],
      },
    ];
  } catch (err) {
    console.error("CustomerTargetAchievement error:", err);
    return [
      {
        achievements: [
          {
            totalTarget: 0,
            totalAchieve: 0,
            averageTarget: 0,
            averageAchieve: 0,
            monthCount: 0,
          },
        ],
      },
    ];
  }
};

// For Dashboar
// export const targetCalculation = async (req, res, next) => {
//     try {
//         let Target = {
//             currentMonthTarget: 0,
//             currentMonthAchieve: 0,
//             targerPending: 0,
//             averageTarget: 0,
//             averageAchievement: 0,
//             averagePending: 0
//         };
//         const {id,database}=req.params
//         let lastMonthCount
//         const startOfDay = moment().startOf('month').toDate();
//         const endOfDay = moment().endOf('month').toDate();
//         const Achievement = await SalesPersonAchievement(database,id)
//         if (Achievement.length === 0) {
//             return res.status(404).json({ message: "achievement not found", status: false })
//         }
//         Achievement[0].achievements.forEach(item => {
//             Target.currentMonthAchieve += item.actualTotalPrice
//             Target.currentMonthTarget += item.targetTotalPrice
//             lastMonthCount = (1 < item.lastMonthCount) ? item.lastMonthCount : 1
//         })
//         Target.targerPending = Target.currentMonthTarget - Target.currentMonthAchieve;
//         Target.averageTarget = Target.currentMonthTarget / lastMonthCount;
//         Target.averageAchievement = Target.currentMonthAchieve / lastMonthCount;
//         Target.averagePending = Target.averageTarget - Target.averageAchievement;
//         res.status(200).json({ Target, status: true })
//     }
//     catch (err) {
//         console.log(err)
//         return res.status(500).json({ error: "Internal Server Error", status: false })
//     }
// }

// // For Dashboard
// export const SalesPersonAchievement = async (database,id) => {
//     try {
//         // const { database } = req.params;
//         const role = await Role.findOne({ database, roleName: "Sales Person" });
//         if (!role) {
//             // return res.status(404).json({ message: "Role Not Found", status: false });
//         }
//         const users = await User.find({ rolename: role._id, database, status: "Active" });
//         if (users.length === 0) {
//             // return res.status(404).json({ message: "No Active Sales Person Found", status: false });
//         }
//         // const { startDate, endDate } = req.body;
//         // const start = startDate ? new Date(startDate) : null;
//         // const end = endDate ? new Date(endDate) : null;
//         const salesPersonPromises = users.map(async (user) => {
//             console.log("user",user )
//             const targetQuery = { salesPersonId: user.sId };
//             // if (start && end) {
//             //     targetQuery.createdAt = { $gte: start, $lte: end };
//             // }
//             const targetss = await TargetCreation.find(targetQuery).populate({ path: "userId", model: "user" }).sort({ sortorder: -1 });
//             if (targetss.length === 0) return null;
//             const countMonth = await TargetCreation.find({ salesPersonId: user.sId})
//             const targets = targetss[targetss.length - 1];
//             console.log("taragerts",countMonth,targets)
//             const orders = await CreateOrder.find({ salesPersonId: targets.sId });
//             // console.log("order",orders)
//             if (!orders || orders.length === 0) return null;
//             const allOrderItems = orders.flatMap(order => order.orderItems);
//             const aggregatedOrders = allOrderItems.reduce((acc, item) => {
//                 const existingItem = acc.find(accItem => accItem.productId.toString() === item.productId._id.toString());
//                 if (existingItem) {
//                     existingItem.qty += item.qty;
//                     existingItem.price = item.price;
//                 } else {
//                     acc.push({
//                         productId: item.productId._id.toString(),
//                         qty: item.qty,
//                         price: item.price,
//                     });
//                 }
//                 return acc;
//             }, []);
//             const productIds = aggregatedOrders.map(order => order.productId);
//             const products = await Product.find({ _id: { $in: productIds } });
//             const productDetailsMap = products.reduce((acc, product) => {
//                 acc[product._id.toString()] = product;
//                 return acc;
//             }, {});
//             const achievements = targets.products.map(targetProduct => {
//                 const matchingOrders = aggregatedOrders.filter(order => order.productId === targetProduct.productId);
//                 if (matchingOrders.length > 0) {
//                     const actualQuantity = matchingOrders.reduce((total, order) => total + order.qty, 0);
//                     const actualTotalPrice = matchingOrders.reduce((total, order) => total + order.qty * order.price, 0);
//                     const productDetails = productDetailsMap[targetProduct.productId.toString()] || {};
//                     return {
//                         User: user,
//                         productId: productDetails,
//                         targetQuantity: targetProduct.qtyAssign,
//                         actualQuantity: actualQuantity,
//                         achievementPercentage: (actualQuantity / targetProduct.qtyAssign) * 100,
//                         productPrice: targetProduct.price,
//                         targetTotalPrice: (targetProduct.qtyAssign * productDetails.Product_MRP),// targetProduct.totalPrice,
//                         actualTotalPrice: (actualQuantity * productDetails.Product_MRP),  //actualTotalPrice
//                         lastMonthCount: countMonth.length
//                     };
//                 }
//                 return null;
//             }).filter(Boolean);

//             return { achievements };
//         });
//         const salesPerson = (await Promise.all(salesPersonPromises)).filter(Boolean);
//         // const salesTarget = salesPerson.map((salesPerson) => {
//         //     if (Array.isArray(salesPerson.achievements) && salesPerson.achievements.length === 1) {
//         //         salesPerson.achievements = salesPerson.achievements[0];
//         //     } else {
//         //         salesPerson.achievements = salesPerson.achievements[0];

//         //     }
//         //     return salesPerson;
//         // });
//         // return res.status(200).json({ salesTarget, status: true });
//         return salesPerson
//     } catch (error) {
//         console.error('Error calculating achievements:', error);
//     }
// };

// All SalesPerson Achievement
export const AllSalesPersonAchievement111 = async (req, res) => {
  try {
    let roleId;
    const role = await Role.find({ database: req.params.database });
    for (let id of role) {
      if (id.roleName === "Sales Person") {
        roleId = id._id;
      }
    }
    const userId = req.params.id;
    const user = await User.find({
      rolename: roleId,
      database: req.params.database,
      status: "Active",
    });
    if (!user) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    let salesPerson = [];
    for (let item of user) {
      const startDate = req.body.startDate
        ? new Date(req.body.startDate)
        : null;
      const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      const targetQuery = { userId: item._id };
      if (startDate && endDate) {
        targetQuery.createdAt = { $gte: startDate, $lte: endDate };
      }
      const targetss = await TargetCreation.find(targetQuery)
        .populate({ path: "userId", model: "user" })
        .sort({ sortorder: -1 });
      const targets = targetss[targetss.length - 1];
      if (targetss.length === 0) {
        console.log("targer not found");
        continue;
      }
      const orders = await CreateOrder.find({ userId: targets.userId });
      if (!orders || orders.length === 0) {
        console.log("order not found");
        continue;
      }
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productDetailsMap = {};
      productDetailsMap.userName = targets?.userId?.firstName;
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      products.forEach((product) => {
        productDetailsMap[product._id.toString()] = product;
      });
      const achievements = targets.products
        .flatMap((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              productPrice: targetProduct.price,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean);
      const overallTargetQuantity = targets.products.reduce(
        (total, targetProduct) => total + targetProduct.qtyAssign,
        0
      );
      const overallActualQuantity = achievements.reduce(
        (total, achievement) => total + achievement.actualQuantity,
        0
      );
      const overallAchievementPercentage =
        (overallActualQuantity / overallTargetQuantity) * 100;
      salesPerson.push({ achievements });
    }
    const salesTarget = salesPerson.map((salesPerson) => {
      if (
        Array.isArray(salesPerson.achievements) &&
        salesPerson.achievements.length === 1
      ) {
        salesPerson.achievements = salesPerson.achievements[0];
      }
      return salesPerson;
    });
    return res.status(200).json({ salesTarget, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const AllSalesPersonAchievement = async (req, res) => {
  try {
    const { database } = req.params;
    const role = await Role.findOne({ database, roleName: "Sales Person" });
    if (!role) {
      return res.status(404).json({ message: "Role Not Found", status: false });
    }
    const users = await User.find({
      rolename: role._id,
      database,
      status: "Active",
    });
    if (users.length === 0) {
      return res
        .status(404)
        .json({ message: "No Active Sales Person Found", status: false });
    }
    const { startDate, endDate } = req.body;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const salesPersonPromises = users.map(async (user) => {
      const targetQuery = { userId: user._id };
      if (start && end) {
        targetQuery.createdAt = { $gte: start, $lte: end };
      }
      const targetss = await TargetCreation.find(targetQuery)
        .populate({ path: "userId", model: "user" })
        .sort({ sortorder: -1 });
      if (targetss.length === 0) return null;
      const targets = targetss[targetss.length - 1];
      const orders = await CreateOrder.find({ userId: targets.userId });
      if (!orders || orders.length === 0) return null;
      const allOrderItems = orders.flatMap((order) => order.orderItems);
      const aggregatedOrders = allOrderItems.reduce((acc, item) => {
        const existingItem = acc.find(
          (accItem) =>
            accItem.productId.toString() === item.productId._id.toString()
        );
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.price += item.price;
        } else {
          acc.push({
            productId: item.productId._id.toString(),
            qty: item.qty,
            price: item.price,
          });
        }
        return acc;
      }, []);
      const productIds = aggregatedOrders.map((order) => order.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      const productDetailsMap = products.reduce((acc, product) => {
        acc[product._id.toString()] = product;
        return acc;
      }, {});
      const achievements = targets.products
        .map((targetProduct) => {
          const matchingOrders = aggregatedOrders.filter(
            (order) => order.productId === targetProduct.productId
          );
          if (matchingOrders.length > 0) {
            const actualQuantity = matchingOrders.reduce(
              (total, order) => total + order.qty,
              0
            );
            const actualTotalPrice = matchingOrders.reduce(
              (total, order) => total + order.qty * order.price,
              0
            );
            const productDetails =
              productDetailsMap[targetProduct.productId.toString()] || {};
            return {
              User: user,
              productId: productDetails,
              targetQuantity: targetProduct.qtyAssign,
              actualQuantity: actualQuantity,
              achievementPercentage:
                (actualQuantity / targetProduct.qtyAssign) * 100,
              productPrice: targetProduct.price,
              targetTotalPrice: targetProduct.totalPrice,
              actualTotalPrice: actualTotalPrice,
            };
          }
          return null;
        })
        .filter(Boolean);

      return { achievements };
    });
    const salesPerson = (await Promise.all(salesPersonPromises)).filter(
      Boolean
    );
    const salesTarget = salesPerson.map((salesPerson) => {
      if (
        Array.isArray(salesPerson.achievements) &&
        salesPerson.achievements.length === 1
      ) {
        salesPerson.achievements = salesPerson.achievements[0];
      }
      return salesPerson;
    });
    return res.status(200).json({ salesTarget, status: true });
  } catch (error) {
    console.error("Error calculating achievements:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const BuildSalesTargetsFromCustomers = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      salesPersonIds = [], // sales-person sId(s)
      month, // optional numeric month 1..12
      year, // optional numeric year
      createdBy, // actor user _id (from localStorage.userData._id)
    } = req.body || {};

    // Build match for "customer targets" only: docs that have a partyId set.
    const match = {
      partyId: { $exists: true, $ne: null },
    };

    // Date handling: your "date" field is like "April-2025" (MonthName-YYYY)
    const MONTHS = [
      "",
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
    ];
    if (month && year) {
      match.date = `${MONTHS[Number(month)]}-${Number(year)}`;
    }
    if (Array.isArray(salesPersonIds) && salesPersonIds.length) {
      match.salesPersonId = { $in: salesPersonIds.map(String) };
    }

    // Aggregate customer targets → (salesPersonId,date) grouped products & totals
    const agg = await TargetCreation.aggregate([
      { $match: match },
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            salesPersonId: "$salesPersonId",
            date: "$date",
            productId: "$products.productId",
          },
          qtyAssign: { $sum: { $ifNull: ["$products.qtyAssign", 0] } },
          priceAvg: { $avg: { $ifNull: ["$products.price", 0] } }, // average if different
        },
      },
      {
        $group: {
          _id: {
            salesPersonId: "$_id.salesPersonId",
            date: "$_id.date",
          },
          products: {
            $push: {
              productId: "$_id.productId",
              qtyAssign: "$qtyAssign",
              price: "$priceAvg",
              totalPrice: { $multiply: ["$qtyAssign", "$priceAvg"] },
              assignPercentage: [], // aggregated doc doesn't need per-customer % trail
            },
          },
          grandTotal: { $sum: { $multiply: ["$qtyAssign", "$priceAvg"] } },
        },
      },
    ]).session(session);

    // Upsert one Sales-Person target per (salesPersonId,date)
    const results = [];
    for (const grp of agg) {
      const spSid = grp?._id?.salesPersonId;
      const spDate = grp?._id?.date;
      if (!spSid || !spDate) continue;

      // Get the Sales-Person user by sId → need their _id & database
      const spUser = await User.findOne({ sId: spSid }).session(session);
      if (!spUser?._id) {
        // Skip if no user record found for this sId
        continue;
      }

      // Upsert TargetCreation (sales-person level = NO partyId; HAS userId & salesPersonId)
      const payload = {
        userId: spUser._id, // IMPORTANT: user target belongs to salesperson userId
        salesPersonId: spSid, // keep sId reference too
        date: spDate,
        products: grp.products,
        grandTotal: grp.grandTotal || 0,
        database: spUser.database, // align db with salesperson’s db
        created_by: createdBy || spUser.created_by || spUser._id, // who triggered it
      };

      const up = await TargetCreation.findOneAndUpdate(
        { userId: spUser._id, date: spDate }, // unique pair
        { $set: payload },
        { new: true, upsert: true, session }
      );
      results.push(up);
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: true,
      message: `Built ${results.length} sales-person target(s) from customer targets.`,
      data: results,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("BuildSalesTargetsFromCustomers error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err?.message,
    });
  }
};
