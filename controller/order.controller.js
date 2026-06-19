import dotenv from "dotenv";
import moment from "moment";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import pdf from "html-pdf";
import { User } from "../model/user.model.js";
import { Product } from "../model/product.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { generateInvoice, generateOrderNo } from "../service/invoice.js";
import QRCode from "qrcode";
import {
  getCreateOrderHierarchy,
  getUserHierarchyBottomToTop,
} from "../rolePermission/RolePermission.js";
import { Customer } from "../model/customer.model.js";
import { createInvoiceTemplate } from "../Invoice/invoice.js";
import transporter from "../service/email.js";
import { Warehouse } from "../model/warehouse.model.js";
import { UpdateCheckLimitSales, checkLimit } from "../service/checkLimit.js";
import { Ledger } from "../model/ledger.model.js";
import { ClosingStock } from "../model/closingStock.model.js";
import { Receipt } from "../model/receipt.model.js";
import { ledgerPartyForDebit } from "../service/ledger.js";
import {
  addProductInWarehouse5,
  addProductInWarehouse6,
} from "./product.controller.js";
import { Stock } from "../model/stock.js";
import { CompanyDetails } from "../model/companyDetails.model.js";
// import transporterss from "../service/email.js";
import nodemailer from "nodemailer";
import { Role } from "../model/role.model.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
import { PaymentQr } from "../model/paymentQrModel.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createOrder = async (req, res, next) => {
  try {
    console.log("req.body", req.body);

    const orderItems = Array.isArray(req.body.orderItems)
      ? req.body.orderItems
      : [];

    const date1 = new Date();
    const date2 = new Date(req.body.date);

    const party = await Customer.findById({ _id: req.body.partyId });

    if (!party) {
      return res.status(404).json({
        message: "Customer not found",
        status: false,
      });
    }

    const user = await User.findOne({ _id: party.created_by });

    if (!user) {
      return res.status(401).json({
        message: "No user found",
        status: false,
      });
    }

    if (isNaN(date2.getTime())) {
      return res.status(400).json({
        message: "Invalid date format",
        status: false,
      });
    }

    // selectedDatabase = yearly DB from frontend, example: ekopack-2025-26
    // Only order save will happen in this DB.
    const selectedDatabase = req.body.database || user.database;

    // mainDatabase = base DB.
    // Product + Warehouse stock will always be handled from this DB.
    const mainDatabase = user.database;

    if (date1.toDateString() !== date2.toDateString()) {
      return res.status(404).json({
        message: "select current date",
        status: false,
      });
    }

    const orderNo = await generateOrderNo(selectedDatabase);

    const updatedOrderItems = [];

    for (const orderItem of orderItems) {
      const product = await Product.findOne({
        _id: orderItem.productId,
        database: mainDatabase,
      });

      if (!product) {
        return res.status(404).json({
          message: `Product with ID ${orderItem.productId} not found`,
          status: false,
        });
      }

      product.salesDate = new Date();

      const warehouseId = orderItem?.warehouse || product.warehouse;

      const warehouse = await Warehouse.findOne({
        _id: warehouseId,
        database: mainDatabase,
      });

      if (!warehouse) {
        return res.status(404).json({
          message: `Warehouse not found for product ${product.Product_Title || product._id}`,
          status: false,
        });
      }

      const pro = warehouse.productItems.find(
        (item) => item.productId.toString() === orderItem.productId.toString(),
      );

      if (!pro) {
        return res.status(404).json({
          message: `Product not found inside warehouse ${warehouse.warehouseName || warehouse._id}`,
          status: false,
        });
      }

      const qty = Number(orderItem.qty) || 0;

      if (Number(pro.currentStock || 0) < qty) {
        return res.status(400).json({
          message: `Not enough stock for product ${product.Product_Title || product._id}`,
          status: false,
        });
      }

      pro.currentStock = Number(pro.currentStock || 0) - qty;
      product.qty = Number(product.qty || 0) - qty;
      product.pendingQty = Number(product.pendingQty || 0) + qty;

      const finalOrderItem = {
        ...orderItem,
        warehouse: warehouse._id,
        qty,
      };

      await addProductInWarehouse6(
        product,
        warehouse._id,
        finalOrderItem,
        req.body.date,
      );

      await warehouse.save();
      await product.save();

      updatedOrderItems.push(finalOrderItem);
    }

    const result = await generateInvoice(selectedDatabase);

    const challanNo = result;
    const invoiceId = result;

    req.body.challanNo = challanNo;
    req.body.invoiceId = invoiceId;
    req.body.userId = party.created_by;

    // Save order in selected yearly database.
    req.body.database = selectedDatabase;

    req.body.orderNo = orderNo;
    req.body.orderItems = updatedOrderItems;

    // Do not make order completed here.
    req.body.status = req.body.status || "pending";

    const fyDate = new Date(req.body.date);
    const fyMonth = fyDate.getMonth() + 1;
    const fyYear = fyDate.getFullYear();
    const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;

    req.body.financialYear =
      req.body.financialYear ||
      `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

    const savedOrder = await CreateOrder.create(req.body);

    req.body.totalAmount = req.body.grandTotal;
    req.body.orderId = savedOrder._id;

    if (party.paymentTerm === "credit") {
      await checkLimit(req.body);
    }

    return res.status(200).json({
      orderDetail: savedOrder,
      status: true,
    });
  } catch (err) {
    console.error("Error in createOrder:", err);

    return res.status(500).json({
      error: err?.message || "Internal Server Error",
      status: false,
    });
  }
};

export const createOrderWithInvoice = async (req, res, next) => {
  try {
    console.log("req.body", req.body);

    const orderItems = Array.isArray(req.body.orderItems)
      ? req.body.orderItems
      : [];

    const date1 = new Date();
    const date2 = new Date(req.body.date);

    const party = await Customer.findById({ _id: req.body.partyId });
    if (!party) {
      return res.status(404).json({
        message: "Customer not found",
        status: false,
      });
    }

    const user = await User.findOne({ _id: party.created_by });
    if (!user) {
      return res.status(401).json({
        message: "No user found",
        status: false,
      });
    }

    // invoiceDatabase = yearly database, only for invoice/payment/ledger save
    const invoiceDatabase = req.body.database || user.database;

    // mainDatabase = normal base database, for product/warehouse/stock deduction
    const mainDatabase = user.database;

    const deductStockFromMainDatabase = async () => {
      const updatedOrderItems = [];

      for (const orderItem of orderItems) {
        const product = await Product.findOne({
          _id: orderItem.productId,
          database: mainDatabase,
        });

        if (!product) {
          console.log(`Product with ID ${orderItem.productId} not found`);
          updatedOrderItems.push(orderItem);
          continue;
        }

        const warehouseId = orderItem?.warehouse || product.warehouse;

        const warehouse = await Warehouse.findOne({
          _id: warehouseId,
          database: mainDatabase,
        });

        if (!warehouse) {
          console.log("Warehouse ID not found");
          updatedOrderItems.push(orderItem);
          continue;
        }

        const pro = warehouse.productItems.find(
          (item) =>
            item.productId.toString() === orderItem.productId.toString(),
        );

        if (!pro) {
          console.log("Product not found inside warehouse");
          updatedOrderItems.push(orderItem);
          continue;
        }

        const qty = Number(orderItem.qty) || 0;

        if (Number(pro.currentStock || 0) < qty) {
          throw new Error(
            `Not enough stock for product ${product.Product_Title || product._id}`,
          );
        }

        product.qty = Number(product.qty || 0) - qty;

        await product.save();

        await addProductInWarehouse5(
          product,
          warehouse._id,
          {
            ...orderItem,
            warehouse: warehouse._id,
            qty,
          },
          req.body.date,
        );

        updatedOrderItems.push({
          ...orderItem,
          warehouse: warehouse._id,
          qty,
        });
      }

      return updatedOrderItems;
    };

    if (date1.toDateString() === date2.toDateString()) {
      const updatedOrderItems = await deductStockFromMainDatabase();

      req.body.status = "completed";
      req.body.userId = party.created_by;
      req.body.database = invoiceDatabase;
      req.body.orderItems = updatedOrderItems;

      party.remainingLimit -= req.body.grandTotal;
      await party.save();

      const upiId = req.body.upiId;
      const merchantName = req.body.merchantName;
      const accountNumber = req.body.accountNumber || "";
      const bankIFSC = req.body.bankIFSC || "";

      const amount = req.body.grandTotal;
      const orderNo =
        req.body.orderNo || req.body.invoiceId || `INV${Date.now()}`;
      const partyName = party.CompanyName;

      const invoiceDate = new Date(req.body.date).toISOString().split("T")[0];
      const invoiceTime = new Date().toLocaleTimeString();

      const note = `Party:${partyName},Invoice:${orderNo},Date:${invoiceDate},Time:${invoiceTime},Amount:${amount}`;

      const upiLink = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${amount}&cu=INR&tn=${encodeURIComponent(
        note,
      )}`;

      const qrFolder = path.join(process.cwd(), "public/Images");

      if (!fs.existsSync(qrFolder)) {
        fs.mkdirSync(qrFolder, { recursive: true });
      }

      const qrFileName = `invoice-${orderNo}.png`;
      const qrPath = path.join(qrFolder, qrFileName);

      await QRCode.toFile(qrPath, upiLink);

      req.body.upiId = upiId;
      req.body.merchantName = merchantName;
      req.body.accountNumber = accountNumber;
      req.body.bankIFSC = bankIFSC;
      req.body.upiLink = upiLink;
      req.body.qrCode = qrFileName;
      req.body.Time = invoiceTime;
      req.body.Date = invoiceDate;
      req.body.paidAmount = 0;
      req.body.paidAmounts = amount;
      req.body.paymentVerified = false;

      const fyDate = new Date(req.body.date);
      const fyMonth = fyDate.getMonth() + 1;
      const fyYear = fyDate.getFullYear();
      const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;

      req.body.financialYear =
        req.body.financialYear ||
        `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

      const [qrData, savedOrder] = await Promise.all([
        PaymentQr.create(req.body),
        CreateOrder.create(req.body),
      ]);

      if (savedOrder) {
        const particular = "SalesInvoice";
        await ledgerPartyForDebit(savedOrder, particular);
      }

      return res.status(200).json({
        orderDetail: savedOrder,
        status: true,
      });
    } else if (date1 > date2) {
      const updatedOrderItems = await deductStockFromMainDatabase();

      req.body.status = "completed";
      req.body.userId = party.created_by;
      req.body.database = invoiceDatabase;
      req.body.orderItems = updatedOrderItems;
      req.body.paymentStatus = true;

      party.remainingLimit -= req.body.grandTotal;
      await party.save();

      const upiId = req.body.upiId;
      const merchantName = req.body.merchantName;
      const accountNumber = req.body.accountNumber || "";
      const bankIFSC = req.body.bankIFSC || "";

      const amount = req.body.grandTotal;
      const orderNo =
        req.body.orderNo || req.body.invoiceId || `INV${Date.now()}`;
      const partyName = party.CompanyName;

      const invoiceDate = new Date(req.body.date).toISOString().split("T")[0];
      const invoiceTime = new Date().toLocaleTimeString();

      const note = `Party:${partyName},Invoice:${orderNo},Date:${invoiceDate},Time:${invoiceTime},Amount:${amount}`;

      const upiLink = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${amount}&cu=INR&tn=${encodeURIComponent(
        note,
      )}`;

      const qrFolder = path.join(process.cwd(), "public/Images");

      if (!fs.existsSync(qrFolder)) {
        fs.mkdirSync(qrFolder, { recursive: true });
      }

      const qrFileName = `invoice-${orderNo}.png`;
      const qrPath = path.join(qrFolder, qrFileName);

      await QRCode.toFile(qrPath, upiLink);

      req.body.upiId = upiId;
      req.body.merchantName = merchantName;
      req.body.accountNumber = accountNumber;
      req.body.bankIFSC = bankIFSC;
      req.body.upiLink = upiLink;
      req.body.qrCode = qrFileName;
      req.body.Time = invoiceTime;
      req.body.Date = invoiceDate;
      req.body.paidAmount = 0;
      req.body.paidAmounts = amount;
      req.body.paymentVerified = false;

      const fyDate = new Date(req.body.date);
      const fyMonth = fyDate.getMonth() + 1;
      const fyYear = fyDate.getFullYear();
      const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;

      req.body.financialYear =
        req.body.financialYear ||
        `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

      const [qrData, savedOrder] = await Promise.all([
        PaymentQr.create(req.body),
        CreateOrder.create(req.body),
      ]);

      if (savedOrder) {
        const particular = "SalesInvoice";
        await ledgerPartyForDebit(savedOrder, particular);
      }

      return res.status(200).json({
        orderDetail: savedOrder,
        status: true,
      });
    } else {
      return res.status(400).json({
        message: "can not purchaseOrder of next date",
        status: false,
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: err?.message || "Internal Server Error",
      status: false,
    });
  }
};

export const getCreateOrderGstBucketsByDatabase = async (req, res, next) => {
  try {
    const { database } = req.params;

    if (!database) {
      return res.status(400).json({
        message: "Database is required",
        status: false,
      });
    }

    const orderHistory = await CreateOrder.find({
      database,
      status: { $ne: "Deactive" },
    })
      .populate({
        path: "orderItems.productId",
        model: "product",
      })
      .populate({
        path: "userId",
        model: "user",
      })
      .populate({
        path: "partyId",
        model: "customer",
      })
      .populate({
        path: "warehouseId",
        model: "warehouse",
      })
      .sort({ createdAt: -1 })
      .exec();

    if (!orderHistory || orderHistory.length === 0) {
      return res.status(404).json({
        message: "No order history found",
        status: false,
        b2bData: [],
        b2csData: [],
        b2clData: [],
      });
    }

    const b2bData = [];
    const b2csData = [];
    const b2clData = [];

    for (const invoice of orderHistory) {
      const registrationType = invoice?.partyId?.registrationType;
      const grandTotal = Number(invoice?.grandTotal || 0);

      if (registrationType === "Regular") {
        b2bData.push(invoice);
      } else if (registrationType === "UnRegister") {
        if (grandTotal <= 50000) {
          b2csData.push(invoice);
        } else {
          b2clData.push(invoice);
        }
      }
    }

    return res.status(200).json({
      status: true,
      message: "Order GST buckets fetched successfully",
      totalOrders: orderHistory.length,
      b2bCount: b2bData.length,
      b2csCount: b2csData.length,
      b2clCount: b2clData.length,
      b2bData,
      b2csData,
      b2clData,
    });
  } catch (err) {
    console.log("Error in getCreateOrderGstBucketsByDatabase:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};
export const createOrderHistoryByUserId = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const orders = await CreateOrder.find({ userId: userId })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .exec();
    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the user", status: false });
    }
    const formattedOrders = orders.map((order) => {
      const formattedOrderItems = order.orderItems.map((item) => ({
        product: item.productId,
        qty: item.qty,
        unitType: item.unitType,
        price: item.price,
        status: item.status,
      }));
      return {
        _id: order._id,
        userId: order.userId,
        fullName: order.fullName,
        partyId: order.partyId,
        invoiceId: order.invoiceId,
        address: order.address,
        MobileNo: order.MobileNo,
        country: order.country,
        state: order.state,
        city: order.city,
        landMark: order.landMark,
        pincode: order.pincode,
        grandTotal: order.grandTotal,
        discount: order.discount,
        shippingCost: order.shippingCost,
        taxAmount: order.taxAmount,
        orderItems: formattedOrderItems,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        currentAddress: req.body.currentAddress,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
    return res
      .status(200)
      .json({ orderHistory: formattedOrders, status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err });
  }
};
export const createOrderHistoryById = async (req, res, next) => {
  try {
    const orders = await CreateOrder.findById(req.params.id)
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .exec();
    return res.status(200).json({ orderHistory: orders, status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err });
  }
};
export const deleteSalesOrder = async (req, res, next) => {
  try {
    const order = await CreateOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Not Found", status: false });
    }
    if (order.status === "completed") {
      return res
        .status(400)
        .json({ error: "this order not deleted", status: false });
    }
    for (const orderItem of order.orderItems) {
      const product = await Product.findById({ _id: orderItem.productId });
      if (product) {
        const warehouse = await Warehouse.findById(product.warehouse);
        if (warehouse) {
          const pro = warehouse.productItems.find(
            (item) => item.productId === orderItem.productId.toString(),
          );
          if (pro) {
            pro.currentStock += orderItem.qty;
            product.qty += orderItem.qty;
            product.pendingQty -= orderItem.qty;
            await deleteProductInStock(
              product,
              product.warehouse,
              orderItem,
              order.date,
            );
            await warehouse.save();
            await product.save();
          }
        }
      } else {
        console.error(`Product With ID ${orderItem.productId} Not Found`);
      }
    }
    await UpdateCheckLimitSales(order);
    order.status = "Deactive";
    await order.save();
    const companyDetails = await CompanyDetails.findOne({
      database: order.database,
    });
    if (companyDetails) {
      companyDetails.cancelInvoice.push({ invoice: order.invoiceId });
      await companyDetails.save();
    }
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
export const createOrderHistoryByPartyId = async (req, res, next) => {
  try {
    const orders = await CreateOrder.findById(req.params.id)
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" });
    if (!orders) {
      return res
        .status(404)
        .json({ message: "No orders found for the user", status: false });
    }
    let partyId;
    if (orders.partyId) {
      partyId = await Customer.findById(orders.partyId._id).populate({
        path: "category",
        model: "customerGroup",
      });
      if (!partyId) {
        console.log("Party details not found");
      }
    } else {
      console.log("Party ID not found in orders");
    }
    return res.status(200).json({
      orderHistory: { ...orders.toObject(), partyId: undefined, partyId },
      status: true,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err });
  }
};
export const OrdertoBilling = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await CreateOrder.findById({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Sales Order Not Found", status: false });
    }
    for (const orderItem of req.body.orderItems) {
      const product = await Product.findById({ _id: orderItem.productId });
      if (product) {
        product.salesDate = new Date();
        const warehouse = await Warehouse.findById(orderItem.warehouse);
        if (warehouse) {
          const pro = warehouse.productItems.find(
            (item) =>
              item.productId.toString() === orderItem.productId.toString(),
          );
          pro.currentStock -= orderItem.qty;
          // product.qty -= orderItem.qty;
          // product.pendingQty += orderItem.qty;
          // await addProductInWarehouse6(product, product.warehouse, orderItem, req.body.date)
          await warehouse.save();
          // await product.save()
        }
      } else {
        console.error(`Product with ID ${orderItem.productId} not found`);
      }
    }
    order.orderItems = req.body.orderItems;
    order.status = "Billing";
    await order.save();
    return res.status(200).json({
      message: "Order Billing Seccessfull!",
      Order: order,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// Order To Dispatch
// controller/order.controller.js

export const OrdertoDispatch = async (req, res) => {
  try {
    const orderId = req.params.id;
    const body = req.body || {};
    const postedItems = Array.isArray(body.orderItems) ? body.orderItems : [];

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const sid = (v) =>
      v && typeof v === "object" && v._id
        ? String(v._id)
        : v != null
          ? String(v)
          : "";

    const order = await CreateOrder.findById({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Sales Order Not Found", status: false });
    }

    // Build a map: productId -> warehouseId from request (safe strings)
    const pidToWarehouse = new Map();
    for (const it of postedItems) {
      const pid = sid(it?.productId);
      const wid = sid(it?.warehouse);
      if (pid && wid) pidToWarehouse.set(pid, wid);
    }

    // Fallback support for legacy payload { warehouse: "..." }
    const legacyWarehouse = sid(body?.warehouse);

    // Mark each line
    for (const item of order.orderItems) {
      const pid = sid(item?.productId);
      const incomingWid =
        pidToWarehouse.size > 0 ? pidToWarehouse.get(pid) : legacyWarehouse;

      if (incomingWid) {
        // Set/override the line's warehouse and mark dispatched
        item.warehouse = incomingWid;
        item.status = "Dispatch";
      }
      // If no incoming warehouse for this line, leave it as-is (Billing or whatever it was)
    }

    // Update package count safely
    order.NoOfPackage = num(order.NoOfPackage) + num(body.NoOfPackage);

    // If all lines are dispatched, order is Dispatch, else Billing
    const allDispatched = order.orderItems.every(
      (it) => String(it?.status || "").toLowerCase() === "dispatch",
    );
    order.status = allDispatched ? "Dispatch" : "Billing";

    const saved = await order.save();
    return res.status(200).json({
      message: "Order forwarded to warehouse",
      Order: saved,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// Order To Dispatch
export const DispatchOrderCancelFromWarehouse = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await CreateOrder.findById({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Sales Order Not Found", status: false });
    }
    order.status = "pending";
    order.Remark = req.body.Remark;
    const orders = await order.save();
    return res.status(200).json({
      message: "Order Dispatch Cancel Seccessfull!",
      Order: orders,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// export const updateCreateOrder = async (req, res, next) => {
//     try {
//         const orderId = req.params.id;
//         const updatedFields = req.body;
//         if (!orderId || !updatedFields) {
//             return res.status(400).json({ message: "Invalid input data", status: false });
//         }
//         const party = await Customer.findById({ _id: updatedFields.partyId })
//         if (!party) {
//             return res.json({ message: "Party Not Found", status: false })
//         }
//         const order = await CreateOrder.findById({ _id: orderId });
//         if (!order) {
//             return res.status(404).json({ message: "Order not found", status: false });
//         }
//         else if (order.status === 'completed') {
//             const oldOrderItems = order.orderItems || [];
//             const newOrderItems = updatedFields.orderItems || [];
//             for (const newOrderItem of newOrderItems) {
//                 const oldOrderItem = oldOrderItems.find(item => item.productId.toString() === newOrderItem.productId.toString());
//                 if (oldOrderItem) {
//                     const quantityChange = newOrderItem.qty - oldOrderItem.qty;
//                     const sTotalChange = newOrderItem.totalPrice - oldOrderItem.totalPrice
//                     const grandTotalChange = updatedFields.grandTotal - order.grandTotal;
//                     party.remainingLimit -= grandTotalChange;
//                     await party.save();
//                     if (quantityChange !== 0) {
//                         const product = await Product.findById({ _id: newOrderItem.productId });
//                         if (product) {
//                             product.qty -= quantityChange;
//                             // product.pendingQty += quantityChange;
//                             const warehouse = await Warehouse.findById({ _id: product.warehouse })
//                             if (warehouse) {
//                                 const pro = warehouse.productItems.find((item) => item.productId.toString() === newOrderItem.productId.toString())
//                                 if (pro) {
//                                     pro.gstPercentage = product.GSTRate
//                                     pro.currentStock += (quantityChange);
//                                     // pro.currentStock -= orderItem.qty
//                                     pro.price = newOrderItems.price;
//                                     pro.totalPrice += newOrderItem.totalPrice;
//                                     pro.transferQty += (quantityChange);
//                                     warehouse.markModified('productItems');
//                                     await warehouse.save();
//                                     await product.save()
//                                     const stock = await Stock.findOne({ warehouseId: product.warehouse.toString(), date: updatedFields.date });
//                                     const ledger = await Ledger.findOne({ partyId: updatedFields.partyId, date: updatedFields.date,particular:"SalesInvoice" });
//                                     if (ledger) {
//                                         ledger.debit =updatedFields.grandTotal;
//                                         await ledger.save();
//                                     }
//                                     if (stock) {
//                                         const findStock = stock.productItems.find((item) => item.productId.toString() === newOrderItem.productId)
//                                         if (findStock) {
//                                             findStock.currentStock += (quantityChange)
//                                             findStock.sQty += (quantityChange)
//                                             findStock.sTotal += sTotalChange
//                                             await stock.save();
//                                         }
//                                     }
//                                 }
//                             }
//                         } else {
//                             console.error(`Product with ID ${newOrderItem.productId} not found`);
//                         }
//                     }
//                 }
//             }
//             Object.assign(order, updatedFields);
//             const updatedOrder = await order.save();
//             return res.status(200).json({ orderDetail: updatedOrder, status: true });
//         } else {
//             const oldOrderItems = order.orderItems || [];
//             const newOrderItems = updatedFields.orderItems || [];
//             for (const newOrderItem of newOrderItems) {
//                 const oldOrderItem = oldOrderItems.find(item => item.productId.toString() === newOrderItem.productId.toString());
//                 if (oldOrderItem) {
//                     const quantityChange = newOrderItem.qty - oldOrderItem.qty;
//                     const sTotalChange = newOrderItem.totalPrice - oldOrderItem.totalPrice
//                     const grandTotalChange = updatedFields.grandTotal - order.grandTotal;
//                     party.remainingLimit -= grandTotalChange;
//                     await party.save();
//                     if (quantityChange !== 0) {
//                         const product = await Product.findById({ _id: newOrderItem.productId });
//                         if (product) {
//                             product.qty -= quantityChange;
//                             product.pendingQty += quantityChange;
//                             const warehouse = await Warehouse.findById({ _id: product.warehouse })
//                             if (warehouse) {
//                                 const pro = warehouse.productItems.find((item) => item.productId.toString() === newOrderItem.productId.toString())
//                                 pro.currentStock -= (quantityChange);
//                                 await warehouse.save();
//                             }
//                             await product.save()
//                             const stock = await Stock.findOne({ warehouseId: product.warehouse.toString(), date: updatedFields.date });
//                             if (stock) {
//                                 const findStock = stock.productItems.find((item) => item.productId.toString() === newOrderItem.productId)
//                                 if (findStock) {
//                                     findStock.pendingStock += (quantityChange)
//                                     // findStock.pendingQty += (quantityChange)
//                                     findStock.pendingStockTotal += sTotalChange
//                                     await stock.save();
//                                 }
//                             }
//                         } else {
//                             console.error(`Product with ID ${newOrderItem.productId} not found`);
//                         }
//                     }
//                 }
//             }
//             Object.assign(order, updatedFields);
//             const updatedOrder = await order.save();
//             return res.status(200).json({ orderDetail: updatedOrder, status: true });
//         }
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ error: "Internal Server Error" });
//     }
// };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sid = (v) => (v ? String(v) : ""); // safe string

export const updateCreateOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const updatedFields = req.body;

    if (!orderId || !updatedFields) {
      return res
        .status(400)
        .json({ message: "Invalid input data", status: false });
    }

    const party = await Customer.findById({ _id: updatedFields.partyId });
    if (!party) return res.json({ message: "Party Not Found", status: false });

    // ensure numeric remainingLimit
    party.remainingLimit = num(party.remainingLimit);

    const order = await CreateOrder.findById({ _id: orderId });
    if (!order)
      return res
        .status(404)
        .json({ message: "Order not found", status: false });

    const fyDate = new Date(updatedFields.date || order.date || new Date());
    const fyMonth = fyDate.getMonth() + 1;
    const fyYear = fyDate.getFullYear();
    const fyStartYear = fyMonth >= 4 ? fyYear : fyYear - 1;
    updatedFields.financialYear =
      updatedFields.financialYear ||
      `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

    const oldItems = (order.orderItems || []).map((it) => ({
      ...(it.toObject?.() || it),
      productId: it.productId,
      qty: num(it.qty),
      totalPrice: num(it.totalPrice),
    }));
    const newItems = (updatedFields.orderItems || []).map((it) => ({
      ...it,
      qty: num(it.qty),
      totalPrice: num(it.totalPrice),
    }));

    const oldMap = new Map(oldItems.map((item) => [sid(item.productId), item]));
    const newMap = new Map(newItems.map((item) => [sid(item.productId), item]));

    const removedItems = oldItems.filter(
      (item) => !newMap.has(sid(item.productId)),
    );
    const addedItems = newItems.filter(
      (item) => !oldMap.has(sid(item.productId)),
    );
    const updatedItems = newItems.filter((item) =>
      oldMap.has(sid(item.productId)),
    );

    const isCompleted = order.status === "completed";

    // ---- removed items
    for (const oldItem of removedItems) {
      const pid = sid(oldItem.productId);
      const product = await Product.findById({ _id: pid });
      if (!product) continue;
      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: sid(product.warehouse),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty += num(oldItem.qty);
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock += num(oldItem.qty);
            whItem.totalPrice -= num(oldItem.totalPrice);
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.currentStock += num(oldItem.qty);
            sItem.sQty -= num(oldItem.qty);
            sItem.sTotal -= num(oldItem.totalPrice);
            await stock.save();
          }
        }
      } else {
        product.qty += num(oldItem.qty);
        product.pendingQty -= num(oldItem.qty);
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock += num(oldItem.qty);
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.pendingStock -= num(oldItem.qty);
            sItem.currentStock += num(oldItem.qty);
            sItem.pendingStockTotal -= num(oldItem.totalPrice);
            await stock.save();
          }
        }
      }

      party.remainingLimit += num(oldItem.totalPrice);
      await product.save();
    }

    // ---- added items
    for (const newItem of addedItems) {
      const pid = sid(newItem.productId);
      const product = await Product.findById({ _id: pid });
      if (!product) continue;
      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: sid(product.warehouse),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty -= num(newItem.qty);
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock -= num(newItem.qty);
            whItem.totalPrice += num(newItem.totalPrice);
            whItem.transferQty += num(newItem.qty);
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.currentStock -= num(newItem.qty);
            sItem.sQty += num(newItem.qty);
            sItem.sTotal += num(newItem.totalPrice);
            await stock.save();
          }
        }
      } else {
        product.qty -= num(newItem.qty);
        product.pendingQty += num(newItem.qty);
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock -= num(newItem.qty);
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.pendingStock += num(newItem.qty);
            sItem.currentStock -= num(newItem.qty);
            sItem.pendingStockTotal += num(newItem.totalPrice);
            await stock.save();
          }
        }
      }

      party.remainingLimit -= num(newItem.totalPrice);
      await product.save();
    }

    // ---- updated items
    for (const newItem of updatedItems) {
      const pid = sid(newItem.productId);
      const oldItem = oldMap.get(pid);
      const qtyChange = num(newItem.qty) - num(oldItem.qty);
      const priceChange = num(newItem.totalPrice) - num(oldItem.totalPrice);

      if (qtyChange === 0 && priceChange === 0) continue;

      const product = await Product.findById({ _id: pid });
      if (!product) continue;
      const warehouse = await Warehouse.findById({ _id: product.warehouse });
      const stock = await Stock.findOne({
        warehouseId: sid(product.warehouse),
        date: updatedFields.date,
      });

      if (isCompleted) {
        product.qty -= qtyChange;
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock -= qtyChange;
            whItem.totalPrice += priceChange;
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.currentStock -= qtyChange;
            sItem.sQty += qtyChange;
            sItem.sTotal += priceChange;
            await stock.save();
          }
        }
      } else {
        product.qty -= qtyChange;
        product.pendingQty += qtyChange;
        if (warehouse) {
          const whItem = warehouse.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (whItem) {
            whItem.currentStock -= qtyChange;
          }
          await warehouse.save();
        }
        if (stock) {
          const sItem = stock.productItems.find(
            (p) => sid(p.productId) === pid,
          );
          if (sItem) {
            sItem.currentStock -= qtyChange;
            sItem.pendingStock += qtyChange;
            sItem.pendingStockTotal += priceChange;
            await stock.save();
          }
        }
      }

      party.remainingLimit -= num(priceChange);
      await product.save();
    }

    const ledger = await Ledger.findOne({
      partyId: updatedFields.partyId,
      date: updatedFields.date,
      particular: "SalesInvoice",
    });
    if (ledger) {
      ledger.debit = num(updatedFields.grandTotal); // <- numeric
      await ledger.save();
    }

    await party.save();

    Object.assign(order, {
      ...updatedFields,
      grandTotal: num(updatedFields.grandTotal),
      roundOff: num(updatedFields.roundOff),
      basicPrice: num(updatedFields.basicPrice),
      amount: num(updatedFields.amount),
      cgstTotal: num(updatedFields.cgstTotal),
      sgstTotal: num(updatedFields.sgstTotal),
      igstTotal: num(updatedFields.igstTotal),
    });
    const updatedOrder = await order.save();
    return res.status(200).json({ orderDetail: updatedOrder, status: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const SalesOrderList = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    const adminDetail = await getUserHierarchyBottomToTop(userId, database);
    if (!adminDetail.length > 0) {
      return res
        .status(404)
        .json({ error: "Product Not Found", status: false });
    }
    const createOrder = await CreateOrder.find({ database: database })
      .populate({
        path: "orderItems.productId",
        model: "product",
      })
      .populate({ path: "partyId", model: "customer" })
      .exec();
    if (!createOrder || createOrder.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found", status: false });
    }
    return res.status(200).json({ orderHistory: createOrder, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const createOrderHistory = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminDetail = await getCreateOrderHierarchy(userId);
    return adminDetail.length > 0
      ? res.status(200).json({ orderHistory: adminDetail, status: true })
      : res.status(400).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const createOrderGstBuckets = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const orderHistory = await getCreateOrderHierarchy(userId);

    if (!orderHistory || orderHistory.length === 0) {
      return res.status(400).json({
        message: "Not Found",
        status: false,
      });
    }

    const b2bData = [];
    const b2csData = [];
    const b2clData = [];

    for (const invoice of orderHistory) {
      const registrationType = invoice?.partyId?.registrationType;
      const grandTotal = Number(invoice?.grandTotal || 0);

      if (registrationType === "Regular") {
        b2bData.push(invoice);
      } else if (registrationType === "UnRegister") {
        if (grandTotal < 50000) {
          b2csData.push(invoice);
        } else if (grandTotal > 50000) {
          b2clData.push(invoice);
        }
      }
    }

    return res.status(200).json({
      status: true,
      b2bData,
      b2csData,
      b2clData,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};
export const updateCreateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;
    const order = await CreateOrder.findById({ _id: orderId })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "orderItems.productId", model: "product" });
    if (!order) {
      return res.status(404).json({ message: "sales order not found" });
    }
    order.status = status;
    await order.save();
    const timestamp = new Date().toISOString().replace(/[-:]/g, "");
    const invoiceFilename = `invoice_${timestamp}.pdf`;
    const pdfFilePath = path.resolve(__dirname, invoiceFilename);
    await new Promise((resolve, reject) => {
      pdf
        .create(createInvoiceTemplate(order), {})
        .toFile(pdfFilePath, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
    });
    const attachment = fs.readFileSync(pdfFilePath).toString("base64");
    await transporter.sendMail(
      {
        from: process.env.EMAIL,
        to: order.partyId.email,
        subject: "Pdf Generate document",
        html: "Testing Pdf Generate document, Thanks.",
        attachments: [
          {
            content: attachment,
            filename: invoiceFilename,
            contentType: "application/pdf",
            path: pdfFilePath,
          },
        ],
      },
      function (error, info) {
        if (error) {
          console.log(error);
        } else {
          fs.unlinkSync(pdfFilePath);
          res.send("Mail has been sent to your email. Check your mail");
        }
      },
    );
    return res.status(200).json({ Order: order, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error, status: false });
  }
};
export const checkPartyOrderLimit = async (req, res, next) => {
  try {
    // const party = await PartyOrderLimit.findOne({ partyId: req.params.id })
    const party = await Customer.findById(req.params.id);
    if (party) {
      // console.log("party",party)
      const CustomerLimit =
        party.remainingLimit > 0 ? party.remainingLimit : party.limit;
      // const CustomerLimit = (party.remainingLimit > 0) ? party.remainingLimit+party.AdvanceAmount : party.limit;
      // console.log("CustomerLimit",CustomerLimit)
      return res.status(200).json({
        CustomerLimit,
        message: `The limit on your order amount is ${CustomerLimit}`,
        status: true,
      });
    } else {
      return res.status(404).json({ message: "Party Not Found", status: true });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ProductWiseSalesReport = async (req, res, next) => {
  try {
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const targetQuery = { database: req.params.database };
    if (startDate && endDate) {
      targetQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    let orders = [];
    const salesOrder = await CreateOrder.find(targetQuery).populate({
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
      const key = orderItem.productId._id.toString() + orderItem.HSN_Code;
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
// Order History App
export const ViewOrderHistoryForPartySalesPerson = async (req, res, next) => {
  try {
    const { database, superAdminId } = req.params || {};

    let orders = await CreateOrder.find({
      partyId: req.params.id,
      status: { $ne: "Deactive" },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "partyId", model: "customer" });

    // ✅ database filter (optional)
    if (database) {
      const dbLower = String(database).trim().toLowerCase();
      orders = (orders || []).filter((o) => {
        const orderDb = String(
          o?.database ||
            o?.Database ||
            o?.db ||
            o?.userId?.database ||
            o?.partyId?.database ||
            "",
        )
          .trim()
          .toLowerCase();

        return orderDb ? orderDb === dbLower : true;
      });
    }

    // ✅ superAdmin filter (optional)
    if (superAdminId) {
      const target = String(superAdminId).trim();

      orders = (orders || []).filter((o) => {
        let cand =
          o?.superAdminId ||
          (o?.superAdmin ? o.superAdmin._id || o.superAdmin.id : null) ||
          o?.created_by ||
          o?.createdBy ||
          o?.adminId ||
          o?.sellerId ||
          (o?.userId
            ? o.userId.created_by ||
              o.userId.createdBy ||
              o.userId.superAdminId ||
              (o.userId.superAdmin
                ? o.userId.superAdmin._id || o.userId.superAdmin.id
                : null)
            : null) ||
          (o?.partyId ? o.partyId.created_by || o.partyId.createdBy : null) ||
          null;

        if (cand && typeof cand === "object") cand = cand._id || cand.id;
        const sid = cand ? String(cand).trim() : "";

        return sid ? sid === target : false;
      });
    }

    return res.status(200).json({ orderHistory: orders, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

//  For DashBoard
export const SalesOrderCalculate111 = async (req, res, next) => {
  try {
    let salesOrders = {
      totalAmount: 0,
      lastMonthAmount: 0,
      averageAmount: 0,
      totalPending: 0,
      totalDelivery: 0,
    };
    const previousMonthStart = moment()
      .subtract(1, "months")
      .startOf("month")
      .toDate();
    const previousMonthEnd = moment()
      .subtract(1, "months")
      .endOf("month")
      .toDate();
    const order = await CreateOrder.find({
      database: req.params.database,
    }).sort({ sortorder: -1 });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "Sales Order Not Found", status: false });
    }
    const lastMonth = order[0].createdAt.getMonth() + 1;
    for (let item of order) {
      if (item.status === "Completed") {
        salesOrders.totalAmount += item.grandTotal;
      }
      if (item.status === "pending") {
        salesOrders.totalPending++;
      }
      if (item.status === "Pending for Delivery") {
        salesOrders.totalDelivery++;
      }
    }
    const orders = await CreateOrder.find({
      database: req.params.database,
      status: "Completed",
      createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
    });
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ message: "Sales Order Not Found", status: false });
    }
    for (let item of orders) {
      salesOrders.lastMonthAmount += item.grandTotal;
    }
    salesOrders.averageAmount = (salesOrders.totalAmount / lastMonth).toFixed(
      2,
    );
    res.status(200).json({ salesOrders, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const SalesOrderCalculate = async (req, res, next) => {
  try {
    const { id, database } = req.params;
    let salesOrders = {
      totalAmount: 0,
      lastMonthAmount: 0,
      averageAmount: 0,
      totalPending: 0,
      totalDelivery: 0,
    };

    // Find user or customer
    const user = await User.findById(id).populate({
      path: "rolename",
      model: "role",
    });
    const customer = await Customer.findById(id).populate({
      path: "rolename",
      model: "role",
    });

    if (!user && !customer) {
      return res
        .status(404)
        .json({ message: "User or Customer Not Found", status: false });
    }

    const existingUser = user || customer;
    const roleName = existingUser?.rolename?.roleName;

    // Time boundaries for the last month
    const previousMonthStart = moment()
      .subtract(1, "months")
      .startOf("month")
      .toDate();
    const previousMonthEnd = moment()
      .subtract(1, "months")
      .endOf("month")
      .toDate();

    // Fetch all orders for the given database
    let allOrders = await CreateOrder.find({ database }).sort({
      sortorder: -1,
    });

    // Filter orders based on role
    let filteredOrders = [];

    if (roleName === "SuperAdmin" || roleName === "Sales Manager") {
      filteredOrders = allOrders;
    } else if (roleName === "Sales Person") {
      // Match orders by userId
      filteredOrders = allOrders.filter(
        (order) => order.userId?.toString() === existingUser._id.toString(),
      );
    } else if (roleName === "Customer") {
      // Match orders by partyId
      filteredOrders = allOrders.filter(
        (order) => order.partyId?.toString() === existingUser._id.toString(),
      );
    } else {
      return res
        .status(403)
        .json({ message: "Unauthorized Role", status: false });
    }

    if (filteredOrders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the user", status: false });
    }

    // Calculation
    let completedOrdersLastMonth = [];
    const distinctMonths = new Set();

    for (let order of filteredOrders) {
      const orderDate = moment(order.date);
      distinctMonths.add(orderDate.format("YYYY-MM"));

      if (order.status.toLowerCase() === "completed") {
        salesOrders.totalAmount += order.grandTotal;

        if (
          orderDate.isBetween(previousMonthStart, previousMonthEnd, null, "[]")
        ) {
          completedOrdersLastMonth.push(order);
        }
      } else if (order.status.toLowerCase() === "pending") {
        salesOrders.totalPending++;
      } else if (order.status.toLowerCase() === "pending for delivery") {
        salesOrders.totalDelivery++;
      }
    }

    completedOrdersLastMonth.forEach((order) => {
      salesOrders.lastMonthAmount += order.grandTotal;
    });

    // Avoid division by zero
    const totalMonths = distinctMonths.size || 1;
    salesOrders.averageAmount = (salesOrders.totalAmount / totalMonths).toFixed(
      2,
    );

    return res
      .status(200)
      .json({ SalesCalculation: salesOrders, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// For DashBoard
export const DebitorCalculate = async (req, res, next) => {
  try {
    let Debtor = {
      totalReceipt: 0,
      totalDue: 0,
      currentReceipt: 0,
      currentOutstanding: 0,
      totalOutstanding: 0,
    };
    const startOfDay = moment().startOf("month").toDate();
    const endOfDay = moment().endOf("month").toDate();
    const [salesOrder, salesOrderCurrentMonth, receipt, receipts] =
      await Promise.all([
        CreateOrder.find({
          database: req.params.database,
          status: "completed",
        }).sort({ sortorder: -1 }),
        CreateOrder.find({
          database: req.params.database,
          status: "completed",
          date: { $gte: startOfDay, $lte: endOfDay },
        }).sort({ sortorder: -1 }),
        Receipt.find({
          database: req.params.database,
          type: "receipt",
          status: "Active",
        }).sort({ sortorder: -1 }),
        Receipt.find({
          database: req.params.database,
          type: "receipt",
          date: { $gte: startOfDay, $lte: endOfDay },
          status: "Active",
        }).sort({ sortorder: -1 }),
      ]);
    Debtor.totalDue = salesOrder.reduce(
      (sum, item) => sum + item.grandTotal,
      0,
    );
    let currentSales = salesOrderCurrentMonth.reduce(
      (sum, item) => sum + item.grandTotal,
      0,
    );
    Debtor.totalReceipt = receipt.reduce((sum, item) => sum + item.amount, 0);
    Debtor.currentReceipt = receipts.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    res.status(200).json({ Debtor, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// --------------------------------------------
export const deletedSalesOrder = async (req, res, next) => {
  try {
    const order = await CreateOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Not Found", status: false });
    }
    for (const orderItem of order.orderItems) {
      const product = await Product.findById({ _id: orderItem.productId });
      if (product) {
        const warehouse = await Warehouse.findById(product.warehouse);
        if (warehouse) {
          const pro = warehouse.productItems.find(
            (item) => item.productId === orderItem.productId.toString(),
          );
          pro.currentStock += orderItem.qty;
          product.qty += orderItem.qty;
          product.pendingQty -= orderItem.qty;
          await warehouse.save();
          await product.save();
        }
        await revertOutWordStock(orderItem, order.date);
      } else {
        console.error(`Product With ID ${orderItem.productId} Not Found`);
      }
    }
    // if (order.status === "completed") {
    //     const party = await Customer.findById(order.partyId)
    //     party.remainingLimit += order.grandTotal;
    //     await party.save()
    // }
    await UpdateCheckLimitSales(order);
    order.status = "Deactive";
    await order.save();

    await Ledger.findOneAndDelete({ orderId: req.params.id });
    const companyDetails = await CompanyDetails.findOne({
      database: order.database,
    });
    if (companyDetails) {
      companyDetails.cancelInvoice.push({ invoice: order.invoiceId });
      await companyDetails.save();
    }
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
export const deletedSalesOrderMultiple = async (req, res, next) => {
  try {
    const { sales } = req.body;
    for (let item of sales) {
      const order = await CreateOrder.findById(item);
      if (!order) {
        return res.status(404).json({ error: "Not Found", status: false });
      }
      for (const orderItem of order.orderItems) {
        const product = await Product.findById({ _id: orderItem.productId });
        if (product) {
          const warehouse = await Warehouse.findById(orderItem.warehouse);
          if (warehouse) {
            const pro = warehouse.productItems.find(
              (item) => item.productId === orderItem.productId.toString(),
            );
            pro.currentStock += orderItem.qty;
            product.qty += orderItem.qty;
            product.pendingQty -= orderItem.qty;
            await warehouse.save();
            await product.save();
          }
          // console.log("orderItem",orderItem)
          // console.log("date",order.date)
          await revertOutWordStock(orderItem, order.date);
        } else {
          console.error(`Product With ID ${orderItem.productId} Not Found`);
        }
      }
      // console.log("order",order)
      if (order.status === "completed") {
        const party = await Customer.findById(order.partyId);
        party.remainingLimit += order.grandTotal;
        await party.save();
      }
      await UpdateCheckLimitSales(order);
      order.status = "Deactive";
      await order.save();
      // console.log("totalssss",party.remainingLimit)

      await Ledger.findOneAndDelete({ orderId: req.params.id });
      const companyDetails = await CompanyDetails.findOne({
        database: order.database,
      });
      if (companyDetails) {
        companyDetails.cancelInvoice.push({ invoice: order.invoiceId });
        await companyDetails.save();
      }
    }
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
export const deleteProductInStock = async (
  warehouse,
  warehouseId,
  orderItem,
  date,
) => {
  try {
    const dates = new Date(date);
    const startOfDay = new Date(dates);
    const endOfDay = new Date(dates);
    startOfDay.setUTCHours(0, 0, 0, 0);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const stock = await Stock.find({
      warehouseId: warehouseId.toString(),
      date: { $gte: startOfDay },
    });
    if (stock.length === 0) {
      return console.log("warehouse not found");
    } else {
      for (let item of stock) {
        const existingStock = item.productItems.find(
          (item) => item.productId.toString() === warehouse._id.toString(),
        );
        if (existingStock) {
          if (item.date.toDateString() === dates.toDateString()) {
            existingStock.pendingStock -= orderItem.qty;
            existingStock.currentStock += orderItem.qty;
            existingStock.totalPrice -= orderItem.qty * orderItem.price;
            existingStock.rQty += orderItem.qty;
            item.markModified("productItems");
            await item.save();
          } else {
            existingStock.currentStock += orderItem.qty;
            existingStock.totalPrice -= orderItem.qty * orderItem.price;
            // existingStock.rQty += orderItem.qty
            item.markModified("productItems");
            await item.save();
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};
export const DeleteClosingSales = async (orderItem, warehouse) => {
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
      stock.sQty -= orderItem.qty;
      stock.sBAmount -= orderItem.totalPrice;
      stock.sTaxRate -= tax;
      stock.sTotal -= orderItem.totalPrice + tax;
      await stock.save();
    }
  } catch (err) {
    console.log(err);
  }
};

// For Customer Target, Purchase Product Qty By Customer
export const PartyPurchaseqty = async (req, res, next) => {
  try {
    const previousMonthStart = moment()
      .subtract(1, "months")
      .startOf("month")
      .toDate();
    const previousMonthEnd = moment()
      .subtract(1, "months")
      .endOf("month")
      .toDate();
    let qty = 0;
    const partyOrder = await CreateOrder.find({
      partyId: req.params.partyId,
      createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
    });
    if (!partyOrder.length) {
      return res.status(200).json({ qty, status: true });
    }
    for (let item of partyOrder) {
      for (let orderItem of item.orderItems) {
        if (orderItem.productId.toString() === req.params.productId) {
          qty += orderItem.qty;
        }
      }
    }
    return res.status(200).json({ qty, status: true });
  } catch (err) {
    console.error("Error fetching party purchase quantity:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const CheckPartyPayment = async (req, res, next) => {
  try {
    let amount = 100000;
    const Orders = await CreateOrder.find({
      partyId: "66e42d7b3e4aac5818e47e1a",
      paymentStatus: { $ne: true },
    });
    if (Orders.length === 0) {
      return res
        .status(404)
        .json({ message: "Order's Not Found", status: false });
    }
    for (let item of Orders) {
      const remaining = amount - item.grandTotal;
      console.log("-------------------------------");
      console.log(item.grandTotal);
      console.log("-------------------------------");
      if (remaining < 0) {
        console.log("Negetive Value", item.grandTotal);
        return false;
      } else {
        console.log("Positive ", item.grandTotal);
        amount = remaining;
        console.log(remaining);
        Orders.paymentStatus = true;
        console.log(Orders.paymentStatus);
      }
    }
  } catch (err) {
    console.log(err);
  }
};
export const revertOutWordStock = async (orderItem, date) => {
  try {
    const stock = await Stock.findOne({ date: date });
    for (let productItem of stock.productItems) {
      if (productItem.productId === orderItem.productId.toString()) {
        productItem.currentStock += orderItem.qty;
        //   productItem.pendingStock-=orderItem.qty;
        productItem.sQty -= orderItem.qty;
        //   productItem.totalPrice -= orderItem.totalPrice;
        productItem.sTotal -= orderItem.totalPrice;
        await stock.save();
      }
    }
    //   for (let productItem of stock.productItems) {
    //     if (productItem.productId.toString() === orderItem.productId && productItem.currentStock === 0) {
    //       stock.productItems = stock.productItems.filter(item => item.productId.toString() !== orderItem.productId);
    //       await stock.save();
    //       break;
    //     }
    //   }
  } catch (error) {
    console.log(error);
  }
};

export const invoicePartySend = async (req, res, next) => {
  try {
    let pdfPath = "";
    if (req.file) {
      pdfPath = req.file?.path;
      req.body.pdfPath = pdfPath;
    }
    const fileName = req.file?.originalname || "invoice.pdf";
    const {
      title,
      date,
      total,
      invoiceId,
      partyName,
      address,
      superAdminName,
      customer,
      appPassword,
      email,
      CNDate,
      CNNumber,
      CNQty,
    } = req.body;
    const dynamicTransporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: email,
        pass: appPassword,
      },
    });

    const mailOptions = {
      from: {
        name: "Distribution Management System",
        address: email,
      },
      to: customer,
      subject: "Sales Invoice",
      html: `
<div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
  <div style="margin:50px auto;width:70%;padding:20px 0">
    <p style="font-size:1.5em; font-weight:500;">Hi ${
      partyName || "Customer"
    },</p>
    <p>${
      title ||
      "Thank you for your purchase. Please find your invoice details below."
    }</p>

    <table style="width:100%;margin-top:20px;border-collapse:collapse">
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>Invoice ID:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${invoiceId}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>Date:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${date}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>Party Name:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${partyName}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>Address:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${address}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>Total Amount:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">₹ ${total}</td>
      </tr>

      ${
        CNDate || CNNumber || CNQty
          ? `
      <tr>
        <td colspan="2" style="padding:12px 8px;border:1px solid #eee;background:#f9f9f9;"><strong>Credit Note Details:</strong></td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>CN Date:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${CNDate || "-"}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>CN Number:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${CNNumber || "-"}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #eee;"><strong>CN Quantity:</strong></td>
        <td style="padding:8px;border:1px solid #eee;">${CNQty || "-"}</td>
      </tr>`
          : ""
      }
    </table>

    <p style="margin-top:20px;">Please find your invoice also attached as a PDF document.</p>

    <p style="font-size:0.9em;">Regards,<br />${superAdminName}</p>
    <hr style="border:none;border-top:1px solid #eee" />
    <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
      <p>Your Brand Inc</p>
      <p>1600 Amphitheatre Parkway</p>
      <p>California</p>
    </div>
  </div>
</div>
`,
      attachments: pdfPath
        ? [
            {
              filename: fileName,
              path: pdfPath,
              contentType: "application/pdf",
            },
          ]
        : [],
    };
    await dynamicTransporter.sendMail(mailOptions);
    return res
      .status(200)
      .json({ message: "Invoice sent successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const updateOrderArn = async (req, res, next) => {
  try {
    const { ARN } = req.body;
    const order = await CreateOrder.findById(req.params.id);
    if (!order) {
      return res.json({ message: "Sales Invoice Not Found", status: false });
    }
    order.ARN = ARN;
    await order.save();
    res.status(200).json({ message: "Data Updated", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const updateCNDetails = async (req, res, next) => {
  try {
    const order = await CreateOrder.findById(req.params.id);
    if (!order) {
      return res.json({ message: "Sales Invoice Not Found", status: false });
    }
    if (req.file && req.file.filename) {
      order.CNImage = req.file.filename;
    }
    const { CNNumber, CNDate, CNQty } = req.body;
    order.CNNumber = CNNumber;
    order.CNDate = CNDate;
    order.CNQty = CNQty;
    await order.save();
    res.status(200).json({ message: "Data Updated", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const InvoiceIdFrom = async (req, res, next) => {
  try {
    const { database, invoiceId } = req.params;
    let invoice;
    invoice = await CreateOrder.findOne({
      database: database,
      invoiceId: invoiceId,
      status: "completed",
    })
      .populate({
        path: "orderItems.productId",
        model: "product",
      })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "warehouseId", model: "warehouse" })
      .exec();
    if (!invoice) {
      invoice = await PurchaseOrder.findOne({
        database: database,
        invoiceId: invoiceId,
        status: "completed",
      })
        .populate({
          path: "orderItems.productId",
          model: "product",
        })
        .populate({ path: "userId", model: "user" })
        .populate({ path: "partyId", model: "customer" })
        .exec();
    }
    return invoice
      ? res
          .status(200)
          .json({ message: "Data Found", printData: invoice, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const verifyPaymentMode = async (req, res, next) => {
  try {
    const { id, paidAmount, paymentDetails } = req.body;
    const payment = await CreateOrder.findById(id);
    if (!payment) {
      return res.status(200).json({ message: "Not Found", status: false });
    }
    payment.paidAmount = paidAmount;
    payment.paymentDetails = paymentDetails;
    await payment.save();
    res.status(200).json({ message: "first Step Successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: "Internal Server Error",
    });
  }
};

export const verifyQrPayment = async (req, res, next) => {
  try {
    const { id, paymentDetails } = req.body;
    const payment = await PaymentQr.findById(id);
    if (!payment) {
      return res.status(200).json({ message: "Not Found", status: false });
    }
    payment.statusQr = "Completed";
    payment.paymentDetails = paymentDetails;
    await payment.save();
    res.status(200).json({ message: "Payment Successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: "Internal Server Error",
    });
  }
};

export const paymentDetails = async (req, res, next) => {
  try {
    const { database } = req.params;
    const paymentDetails = await PaymentQr.find({ database });
    if (paymentDetails.length === 0) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    res
      .status(200)
      .json({ message: "Data Found", paymentDetails, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: "Internal Server Error",
    });
  }
};

export const verifyFinalPayment = async (req, res, next) => {
  try {
    const { id, paymentVerified } = req.body;

    const payment = await PaymentQr.findById(id);
    if (!payment) {
      return res.status(404).json({ message: "Not Found", status: false });
    }

    if (payment.paymentVerified === true) {
      return res.status(400).json({
        message: "Payment already verified",
        status: false,
      });
    }

    if (!paymentVerified) {
      payment.statusQr = "Rejected";
      payment.paymentVerified = false;
      await payment.save();

      return res.status(200).json({
        message: "Payment rejected",
        status: true,
      });
    }

    let obj = {
      database: payment.database,
      partyId: payment.partyId,
      invoiceId: payment.invoiceId,
    };

    const order = await CreateOrder.findOne(obj);
    if (order) {
      order.paymentVerified = true;
      await order.save();
    }

    payment.paymentVerified = true;
    payment.statusQr = "Approved";
    await payment.save();

    const latestReceipt = await Receipt.findOne({ status: "Active" }).sort({
      voucherNo: -1,
    });

    const voucherNo = latestReceipt ? latestReceipt.voucherNo + 1 : 1;

    const scannedDateString =
      payment?.paymentDetails?.scanDate ||
      payment?.paymentDetails?.date ||
      payment?.Date ||
      "";

    const verifyRemark =
      payment?.paymentDetails?.verifyRemark ||
      payment?.paymentDetails?.remark ||
      payment?.paymentDetails?.rawText ||
      payment?.paymentDetails?.utrNumber ||
      "";

    const parseScannedDate = (value) => {
      if (!value) return new Date();

      const str = String(value).trim();

      const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        let day = Number(slashMatch[1]);
        let month = Number(slashMatch[2]) - 1;
        let year = Number(slashMatch[3]);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      }

      const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dashMatch) {
        return new Date(
          Number(dashMatch[1]),
          Number(dashMatch[2]) - 1,
          Number(dashMatch[3]),
        );
      }

      const parsed = new Date(str);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const savedBankDetailsId =
      payment?.bankDetails || order?.bankDetails || null;

    const receiptData = {
      voucherNo,
      database: payment.database,
      partyId: payment.partyId,
      type: "receipt",
      voucherType: "receipt",
      paymentMode: "Bank",
      amount: payment.paidAmounts,
      status: "Active",
      date: parseScannedDate(scannedDateString),
      remark: verifyRemark,
      bankDetails: savedBankDetailsId,
    };

    await Receipt.create(receiptData);

    return res.status(200).json({
      message: "Payment verified successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: "Internal Server Error",
    });
  }
};
