import { GoodDispatch } from "../model/goodDispatch.model.js";
import { Order } from "../model/order.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import transporter from "../service/email.js";
import { User } from "../model/user.model.js";
import { getGoodDispatchHierarchy } from "../rolePermission/RolePermission.js";
import { Customer } from "../model/customer.model.js";
import { Warehouse } from "../model/warehouse.model.js";
import { Product } from "../model/product.model.js";
import { ledgerPartyForDebit } from "../service/ledger.js";
import { generateInvoice } from "../service/invoice.js";
import {
  addProductInWarehouse7,
  addProductInWarehouse9,
} from "./product.controller.js";
import { deleteProductInStock } from "./order.controller.js";
import { CompanyDetails } from "../model/companyDetails.model.js";

export const saveGoodDispatch = async (req, res) => {
  try {
    let ware;
    const user = await User.findById({ _id: req.body.created_by });
    if (!user) {
      return res.status(400).json({ message: "User Not Found", status: false });
    }
    req.body.database = user.database;
    const order = await Order.findById({ _id: req.body.orderId });
    const orders = await CreateOrder.findById({ _id: req.body.orderId });
    if (!order && !orders) {
      return res
        .status(404)
        .json({ message: "Order not found", status: false });
    }
    if (orders) {
      orders.status = req.body.status;
      await orders.save();
    }
    if (order) {
      order.status = req.body.status;
      await order.save();
    }

    req.body.warehouseId = orders.warehouseId;
    req.body.orderItems = JSON.parse(req.body.orderItems);
    for (const orderItem of req.body.orderItems) {
      const product = await Product.findById({ _id: orderItem.productId._id });
      if (product) {
        // ware = product.warehouse
        // product.salesDate = new Date(new Date())
        const warehouse = await Warehouse.findById(product.warehouse);
        if (warehouse) {
          const pro = warehouse.productItems.find(
            (item) => item.productId === orderItem.productId._id
          );
          // pro.currentStock -= (orderItem.Size * orderItem.qty);
          // if (pro.currentStock < 0) {
          //     return res.status(404).json({ message: "out of stock", status: false })
          // }
          // pro.pendingStock -= (orderItem.qty)
          await warehouse.save();
          // await product.save()
        }
      } else {
        console.error(`Product with ID ${orderItem.productId} not found`);
      }
    }
    if (req.files) {
      let image = null;
      let images = null;
      req.files.map((file) => {
        if (file.fieldname === "invoice") {
          image = file.filename;
        } else {
          images = file.filename;
        }
      });
      req.body.FetchSalesInvoice = image;
      req.body.CNUpload = images;
    }
    const goodDispatch = await GoodDispatch.create(req.body);
    return goodDispatch
      ? res.status(200).json({ message: "save data successfull", status: true })
      : res.status(400).json({ message: "Bad Request", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const updateGoodDispatch = async (req, res) => {
  try {
    const goodDispatchId = req.params.id;
    const existingGoodDispatch = await GoodDispatch.findById({
      _id: goodDispatchId,
    });
    if (!existingGoodDispatch) {
      return res
        .status(404)
        .json({ error: "goodDispatch not found", status: false });
    } else {
      if (req.file) {
        req.body.salesInvoice = req.file.filename;
      }
      const updatedGoodDispatch = req.body;
      const updateDetails = await GoodDispatch.findByIdAndUpdate(
        goodDispatchId,
        updatedGoodDispatch,
        { new: true }
      );
      return updateDetails
        ? res
            .status(200)
            .json({ message: "Data Updated Successfully", status: true })
        : res.status(400).json({ message: "Something Went Wrong" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err, status: false });
  }
};
export const viewGoodDispatch = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    const adminDetail = await getGoodDispatchHierarchy(userId, database);
    // let goodDispatch = await GoodDispatch.find().sort({ sortorder: -1 })
    return adminDetail.length > 0
      ? res.status(200).json({ GoodDispatch: adminDetail, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const viewGoodDispatchById = async (req, res, next) => {
  try {
    let goodDispatch = await GoodDispatch.findById({ _id: req.params.id }).sort(
      { sortorder: -1 }
    );
    return goodDispatch
      ? res.status(200).json({ GoodDispatch: goodDispatch, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deleteGoodDispatch = async (req, res, next) => {
  try {
    const goodDispatch = await GoodDispatch.findByIdAndDelete({
      _id: req.params.id,
    });
    return goodDispatch
      ? res.status(200).json({ message: "delete successful", status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const viewOrderForDeliveryBoy = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    // const adminDetail = await getUserHierarchyBottomToTop(userId, database)
    // if (!adminDetail.length > 0) {
    //     return res.status(404).json({ error: "Product Not Found", status: false })
    // }
    const goodDispatch = await CreateOrder.find({
      database: database,
      AssignDeliveryBoy: req.params.id,
      status: { $ne: "Deactive" },
    })
      .sort({ sortorder: -1 })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "warehouseId", model: "warehouse" });
    return goodDispatch.length > 0
      ? res.status(200).json({ OrderList: goodDispatch, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const sendOtp1 = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    const user = await Customer.findById({ _id: req.params.id });
    if (!user) {
      return res
        .status(404)
        .json({ message: "party not found", status: false });
    }
    var mailOptions = {
      from: "vikramsveltose022@gmail.com",
      to: `${user.email}`,
      subject: "Delivery Verification OTP",
      html:
        '<div style={{fontFamily: "Helvetica,Arial,sans-serif",minWidth: 1000,overflow: "auto",lineHeight: 2}}<div style={{ margin: "50px auto", width: "70%", padding: "20px 0" }}><div style={{ borderBottom: "1px solid #eee" }}><a href=""style={{ fontSize: "1.4em",color: "#00466a" textDecoration: "none",fontWeight: 600}}></a></div><p style={{ fontSize: "1.1em" }}>Hi,</p><p>otp</p><h2 value="otp" style={{ background: "#00466a", margin: "0 auto",width: "max-content" padding: "0 10px",color: "#fff",borderRadius: 4}}>' +
        otp +
        '</h2><p style={{ fontSize: "0.9em" }}Regards,<br />Distribution Management System</p><hr style={{ border: "none", borderTop: "1px solid #eee" }} /></div</div>',
    };
    user.otpVerify = otp;
    await user.save();
    await transporter.sendMail(mailOptions, (error, info) => {
      !error
        ? response
            .status(201)
            .json({ message: "otp send successfull", status: true })
        : console.log(error) ||
          response
            .status(400)
            .json({ error: "Something Went Wrong", status: false });
    });
    return res
      .status(200)
      .json({ message: "otp send successful", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error, status: false });
  }
};
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
export const updateOrderStatusByDeliveryBoy = async (req, res) => {
  try {
    let CNUpload;
    if (req.file) {
      CNUpload = req.file.filename;
    }

    const { status, otp, partyId, orderId, reason, paymentMode, CNDetails } =
      req.body;

    // Fetch order
    const orders = await CreateOrder.findById(orderId);
    if (!orders) {
      return res
        .status(404)
        .json({ message: "Order Not Found", status: false });
    }

    // ================= CANCEL IN PROCESS =================
    if (status === "Cancel in process") {
      const customer = await Customer.findById(partyId);
      if (!customer) {
        return res
          .status(404)
          .json({ message: "Party Not Found", status: false });
      }

      const user = await User.findById(orders.userId);
      if (!user) {
        return res
          .status(404)
          .json({ message: "User Not Found", status: false });
      }

      if (user.otpVerify !== parseInt(otp)) {
        return res
          .status(400)
          .json({ message: "Incorrect OTP", status: false });
      }

      user.otpVerify = undefined;
      customer.remainingLimit += orders.grandTotal;

      const invoiceId = orders.challanNo || orders.invoiceId;

      const commonUpdate = {
        status,
        paymentMode,
        CNUpload,
        invoiceId,
        CNDetails,
      };

      if (reason) commonUpdate.reason = reason;

      Object.assign(orders, commonUpdate);

      await Promise.all([orders.save(), user.save(), customer.save()]);

      if (orders.grandTotal < 50000) {
        const companyDetails = await CompanyDetails.findOne({
          database: orders.database,
        });
        if (companyDetails) {
          companyDetails.cancelInvoice.push({ invoice: orders.invoiceId });
          await companyDetails.save();
        }
      }

      // ================= DELIVERY / COMPLETE =================
    } else {
      const customer = await Customer.findById(partyId);
      if (!customer) {
        return res
          .status(404)
          .json({ message: "Party Not Found", status: false });
      }

      // ✅ Intercity parties do NOT require OTP (based on assignTransporter)
      const isIntercityParty =
        Array.isArray(customer?.assignTransporter) &&
        customer.assignTransporter.length > 0;

      if (!isIntercityParty) {
        if (customer.otpVerify !== parseInt(otp)) {
          return res
            .status(400)
            .json({ message: "Incorrect OTP", status: false });
        }
      }

      customer.otpVerify = undefined;

      const invoiceId = orders.invoiceId || null;
      const challanNo = orders.challanNo || null;

      const commonUpdate = {
        status,
        paymentMode,
        CNUpload,
        invoiceId,
        challanNo,
        CNDetails,
      };

      if (reason) commonUpdate.reason = reason;

      Object.assign(orders, commonUpdate);

      await Promise.all([orders.save(), customer.save()]);

      // ===== Stock Update =====
      for (const orderItem of orders.orderItems) {
        const product = await Product.findById(orderItem.productId);
        if (!product) continue;

        const warehouse = await Warehouse.findById(orderItem.warehouse);
        if (!warehouse) continue;

        const pro = warehouse.productItems.find(
          (it) => it.productId.toString() === orderItem.productId.toString()
        );
        if (!pro) continue;

        // ✅ Safe numeric values
        const qty = toNum(orderItem.qty);
        const price = toNum(orderItem.price);

        // base amount (WITHOUT tax) — fallback if your field names differ
        const baseAmount = toNum(
          orderItem.totalPrice ?? orderItem.taxableAmount ?? qty * price
        );

        // rates (percent)
        const igstRate = toNum(orderItem.igstRate);
        const sgstRate = toNum(orderItem.sgstRate);
        const cgstRate = toNum(orderItem.cgstRate);
        const rateSum = igstRate + sgstRate + cgstRate;

        // ✅ Prefer tax AMOUNTS if your item already stores them; otherwise compute from rate
        let taxAmount =
          toNum(orderItem.igstAmount) +
          toNum(orderItem.sgstAmount) +
          toNum(orderItem.cgstAmount);

        // some codebases store totals under different keys
        if (taxAmount === 0) {
          taxAmount =
            toNum(orderItem.igstTotal) +
            toNum(orderItem.sgstTotal) +
            toNum(orderItem.cgstTotal);
        }

        if (taxAmount === 0 && rateSum > 0) {
          taxAmount = (baseAmount * rateSum) / 100;
        }

        const gstRateFinal = toNum(
          orderItem.gstPercentage,
          toNum(product.GSTRate, rateSum)
        );

        // ✅ Update product + warehouse numbers safely
        product.pendingQty = toNum(product.pendingQty) - qty;

        pro.sQty = toNum(pro.sQty) + qty;
        pro.sRate = price;
        pro.sBAmount = toNum(pro.sBAmount) + baseAmount;
        pro.sTaxRate = gstRateFinal;

        // ✅ THIS prevents NaN and fixes your crash
        pro.sTotal = toNum(pro.sTotal) + baseAmount + taxAmount;

        // Optional: hard guard (helps catch bad data instantly)
        if (!Number.isFinite(pro.sTotal)) {
          throw new Error(
            `Warehouse sTotal became NaN | order=${orders._id} warehouse=${warehouse._id} product=${product._id}`
          );
        }

        await Promise.all([warehouse.save(), product.save()]);

        const current = new Date();
        await addProductInWarehouse7(
          product,
          product.warehouse,
          orderItem,
          current,
          orders.date
        );
      }

      if (orders.status === "completed") {
        await ledgerPartyForDebit(orders, "SalesInvoice");
      }
    }

    return res.status(200).json({
      message: "Delivery Status Updated Successfully",
      status: true,
    });
  } catch (err) {
    console.error("Update Order Error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      status: false,
    });
  }
};

async function trySendSms(mobile, message) {
  try {
    if (!mobile) return;
    // 🔁 Replace with your real SMS function
    // await sendSMS(mobile, message);
    console.log("SMS ->", mobile, message);
  } catch (e) {
    console.log("SMS send failed:", e?.message || e);
  }
}

export const requestOtpForReadyDispatch = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { warehouseId } = req.body;

    // 1) Order
    const order = await CreateOrder.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ message: "order not found", status: false });
    }

    // 2) Warehouse
    const warehouse = await Warehouse.findOne({
      _id: warehouseId,
      status: "Active",
    });
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }

    // 3) Allow ONLY in Ready Dispatch stage (optional but recommended)
    if (String(order.status) !== "DELIVERY BOY ASSIGNED") {
      return res.status(400).json({
        message: `OTP can be requested only when status is DELIVERY BOY ASSIGNED`,
        status: false,
      });
    }

    // 4) Generate + SAVE OTP (as you demanded)
    const otp = Math.floor(1000 + Math.random() * 9000);
    order.otp = otp;
    // if your schema supports extra fields, you can store:
    // order.otpPurpose = "READY_DISPATCH";
    // order.otpCreatedAt = new Date();

    await order.save();

    // 5) Find delivery boy mobile
    // Your order data in app shows: item.AssignDeliveryBoy?.mobileNumber
    let deliveryMobile =
      order?.AssignDeliveryBoy?.mobileNumber ||
      order?.AssignDeliveryBoy?.mobileNo ||
      null;

    // If AssignDeliveryBoy is just an ID, try fetch User
    const assignVal = order?.AssignDeliveryBoy;
    if (!deliveryMobile && assignVal) {
      const deliveryBoyId =
        typeof assignVal === "string" ? assignVal : assignVal?._id;
      if (deliveryBoyId) {
        const db = await User.findById(deliveryBoyId);
        deliveryMobile = db?.mobileNumber || db?.mobileNo || null;
      }
    }

    // 6) Send OTP (optional - integrate your real SMS provider here)
    await trySendSms(
      deliveryMobile,
      `OTP for Out Delivery is: ${otp}. Please share with warehouse for verification.`
    );

    return res.status(200).json({
      message: "OTP sent successfully!",
      status: true,
    });
  } catch (error) {
    console.log("requestOtpForReadyDispatch error:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const verifyOtpForReadyDispatch = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { otp } = req.body;

    const order = await CreateOrder.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ message: "order not found", status: false });
    }

    // Optional: only verify in that stage
    if (String(order.status) !== "DELIVERY BOY ASSIGNED") {
      return res.status(400).json({
        message: "Order is not in Ready Dispatch stage",
        status: false,
      });
    }

    const sentOtp = parseInt(order?.otp);
    const enteredOtp = parseInt(otp);

    if (!sentOtp || sentOtp !== enteredOtp) {
      return res
        .status(400)
        .json({ message: "OTP verification failed", status: false });
    }

    // ✅ SUCCESS → move to Out Delivery stage (your app filters this as "Pending for Delivery")
    order.status = "OUT FOR DELIVERY"; // (This is your Out Delivery tab filter)
    order.otp = undefined; // clear after success (recommended)

    await order.save();

    return res.status(200).json({
      message: "OTP verified successfully. Order moved to Out Delivery.",
      status: true,
    });
  } catch (error) {
    console.log("verifyOtpForReadyDispatch error:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const sendOtp = async (req, res) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);
    const existing = await CreateOrder.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: "order not found", status: false });
    }
    if (req.body.type === "Cancelled") {
      const user = await User.findOne({
        _id: existing.userId,
        status: "Active",
      });
      if (!user) {
        return res
          .status(404)
          .json({ message: "user not found", status: false });
      }
      user.otpVerify = otp;
      await user.save();
    } else {
      const party = await Customer.findOne({
        _id: existing.partyId,
        status: "Active",
      });
      if (!party) {
        return res
          .status(404)
          .json({ message: "party not found", status: false });
      }
      party.otpVerify = otp;
      await party.save();
    }
    return res
      .status(200)
      .json({ message: "otp send successfull!", status: true });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewOtp = async (req, res) => {
  try {
    // const query = { $or: [{ userId }, { partyId }], type: "order" };
    const orderData = await Customer.findById(req.params.id).select(
      "otpVerify"
    );
    if (orderData) {
      return res.status(200).json({ otp: orderData, status: true });
    } else {
      const orderData = await User.findById(req.params.id).select("otpVerify");
      if (orderData) {
        return res.status(200).json({ otp: orderData, status: true });
      }
      return res.status(404).json({ message: "otp not found", status: false });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewWarehouseByOrder = async (req, res, next) => {
  try {
    const order = await CreateOrder.find({
      "orderItems.warehouse": req.params.id,
      status: "Billing",
      status: { $ne: "Deactive" },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "AssignDeliveryBoy", model: "user" });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "warehouse stock not found", status: false });
    }
    return res.status(200).json({ Order: order, status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewWarehouseByOrderInvoice = async (req, res, next) => {
  try {
    const order = await CreateOrder.find({
      "orderItems.warehouse": req.params.id,
      status: "Dispatch",
      status: { $ne: "Deactive" },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "AssignDeliveryBoy", model: "user" });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "warehouse stock not found", status: false });
    }
    return res.status(200).json({ Order: order, status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewWarehouseOrderCancel = async (req, res, next) => {
  try {
    const order = await CreateOrder.find({
      "orderItems.warehouse": req.params.id,
      status: "Cancel in process",
    }).populate({ path: "orderItems.productId", model: "product" });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "warehouse stock not found", status: false });
    }
    return res.status(200).json({ Order: order, status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewWarehouseByOrders = async (req, res, next) => {
  try {
    const order = await CreateOrder.find({
      "orderItems.warehouse": req.params.id,
      status: { $ne: "Deactive" },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" })
      .populate({ path: "AssignDeliveryBoy", model: "user" });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "warehouse stock not found", status: false });
    }
    return res.status(200).json({ Order: order, status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const SendOtpToDeliveryWarehouse = async (req, res) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);
    const existing = await CreateOrder.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: "order not found", status: false });
    }
    const warehouse = await Warehouse.findOne({
      _id: req.body.warehouseId,
      status: "Active",
    });
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }
    existing.otp = otp;
    const updateWarehouse = await existing.save();
    return res
      .status(200)
      .json({ message: "otp send successfull!", status: true });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewOtpWarehouse = async (req, res) => {
  try {
    // const query = { $or: [{ userId }, { partyId }], type: "order" };
    const orderData = await Warehouse.findById(req.params.id).select("otp");
    if (orderData) {
      return res.status(200).json({ otp: orderData, status: true });
    } else {
      return res.status(404).json({ message: "otp not found", status: false });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const OrderCancelWarehouse = async (req, res, next) => {
  try {
    const existingOrder = await CreateOrder.findById(req.params.id);
    if (!existingOrder) {
      return res
        .status(404)
        .json({ message: "Order Not Found", status: false });
    }
    let productFound = false;
    for (const item of existingOrder.orderItems) {
      if (item.status !== "Cancelled") {
        item.status = "Cancelled";
        existingOrder.status = "Cancelled";
        productFound = true;
        const product = await Product.findById({ _id: item.productId });
        if (product) {
          const warehouse = await Warehouse.findById(item.warehouse);
          // const warehouse = await Warehouse.findById(product.warehouse);
          if (existingOrder.otp == req.body.otp) {
            const pro = warehouse.productItems.find(
              (items) =>
                items.productId.toString() === item.productId.toString()
            );
            if (pro) {
              pro.currentStock += item.qty;
              product.qty += item.qty;
              product.pendingQty -= item.qty;
              // pro.pendingStock -= (item.qty)
              await addProductInWarehouse9(
                product,
                item.warehouse,
                item,
                existingOrder.date
              );
              await warehouse.save();
              await product.save();
            }
          } else {
            return res
              .status(400)
              .json({ message: "otp does not matched", status: false });
          }
        } else {
          console.error(`Product with ID ${item.productId} not found`);
        }
      } else {
        console.log("Not Found");
      }
    }
    for (const item of existingOrder.orderItems) {
      if (item.status === "Cancelled") {
        existingOrder.status = "Cancelled";
      } else {
        existingOrder.status = "Cancel in process";
      }
    }
    existingOrder.otp = undefined;
    await existingOrder.save();
    return res
      .status(200)
      .json({ message: "Product Cancel Successfull!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewWarehouseOrderCompletedOrCancel = async (req, res, next) => {
  try {
    const order = await CreateOrder.find({
      "orderItems.warehouse": req.params.id,
      status: { $in: ["completed", "Cancelled"] },
    })
      .populate({ path: "orderItems.productId", model: "product" })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "userId", model: "user" });
    if (order.length === 0) {
      return res
        .status(404)
        .json({ message: "warehouse stock not found", status: false });
    }
    return res.status(200).json({ Order: order, status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// Billing Time
export const ProductInWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.find({
      "productItems.productId": req.params.productId,
      status: "Active",
    }).select("warehouseName");
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "Product Not Found in Warehouse", status: false });
    }
    return res.status(200).json({ Warehouse: warehouse, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
