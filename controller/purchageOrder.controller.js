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

export const purchaseOrder = async (req, res, next) => {
  try {
    const orderItems = req.body.orderItems;
    const user = await User.findOne({ _id: req.body.userId });
    if (!user) {
      return res.status(401).json({ message: "No user found", status: false });
    } else {
      for (const orderItem of orderItems) {
        const product = await Product.findOne({ _id: orderItem.productId });
        if (product) {
          // product.purchaseDate = new Date()
          // product.partyId = req.body.partyId;
          // product.purchaseStatus = true
          // product.basicPrice = await orderItem.basicPrice;
          // product.landedCost = await orderItem.landedCost;
          // await product.save();
          // console.log(await product.save())
          // const warehouse = { productId: orderItem.productId, unitType: orderItem.unitType, currentStock: orderItem.qty, transferQty: orderItem.qty, price: orderItem.price, totalPrice: orderItem.totalPrice, Size: orderItem.Size }
          // await addProductInWarehouse(warehouse, product.warehouse)
        } else {
          return res
            .status(404)
            .json(`Product with ID ${orderItem.productId} not found`);
        }
      }
      req.body.userId = user._id;
      req.body.database = user.database;
      const order = await PurchaseOrder.create(req.body);
      return order
        ? res.status(200).json({ orderDetail: order, status: true })
        : res
            .status(400)
            .json({ message: "Something Went Wrong", status: false });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};
export const purchaseInvoiceOrder = async (req, res, next) => {
  try {
    let groupDiscount = 0;
    const orderItems = req.body.orderItems || [];

    const user = await User.findOne({ _id: req.body.userId });
    if (!user) {
      return res.status(401).json({ message: "No user found", status: false });
    }

    const date1 = new Date();
    const date2 = new Date(req.body.date);
    const party = await Customer.findById(req.body.partyId);
    if (!party) {
      return res
        .status(404)
        .json({ message: "Party not found", status: false });
    }

    // 🔒 Normalize/guard new bill-level fields (don’t fail if missing)
    // Frontend now sends these; keep defaults if not provided
    req.body.discountDetails = Array.isArray(req.body.discountDetails)
      ? req.body.discountDetails
      : [];

    // handle numeric splits on charges GST
    req.body.ChargesCgst = Number(req.body.ChargesCgst || 0);
    req.body.ChargesSgst = Number(req.body.ChargesSgst || 0);
    req.body.ChargesIgst = Number(req.body.ChargesIgst || 0);

    // booleans & totals
    req.body.igstTaxType =
      typeof req.body.igstTaxType === "boolean"
        ? req.body.igstTaxType
        : Boolean(req.body.igstTaxType);

    req.body.amount = Number(req.body.amount || 0); // taxable after discounts & charges
    req.body.roundOff = Number(req.body.roundOff || 0);
    req.body.sgstTotal = Number(req.body.sgstTotal || 0);
    req.body.cgstTotal = Number(req.body.cgstTotal || 0);
    req.body.igstTotal = Number(req.body.igstTotal || 0);
    req.body.grandTotal = Number(req.body.grandTotal || 0);

    // optional compact HSN summary
    if (req.body.hsnSummary && typeof req.body.hsnSummary === "object") {
      // leave shape as-is; schema validates fields
    } else {
      req.body.hsnSummary = null;
    }

    // allow any GST details structure
    if (!Array.isArray(req.body.gstDetails)) req.body.gstDetails = [];

    // ---------- stock updates (unchanged) ----------
    const applyForDate = async () => {
      for (const orderItem of orderItems) {
        const product = await Product.findOne({ _id: orderItem.productId });
        if (!product) {
          return res
            .status(404)
            .json(`Product with ID ${orderItem.productId} not found`);
        }

        const group = await CustomerGroup.find({
          database: product.database,
          status: "Active",
        });

        if (group.length > 0) {
          const maxDiscount = group.reduce((max, g) =>
            g.discount > max.discount ? g : max
          );
          groupDiscount = maxDiscount.discount;
        }

        // Purchase Rate & landed cost update
        // (your original logic had 2 branches; kept behavior with minor cleanup)
        const landed = Number(orderItem.landedCost || orderItem.price || 0);

        // WHEN same day: set Purchase_Rate = orderItem.price (as in your original first branch)
        // WHEN backdate: set to landedCost (as in your original second branch)
        if (date1.toDateString() === date2.toDateString()) {
          product.Purchase_Rate = Number(orderItem.price);
        } else {
          product.Purchase_Rate =
            product.Purchase_Rate > landed ? product.Purchase_Rate : landed;
        }

        product.landedCost = landed;

        if (!product.ProfitPercentage || product.ProfitPercentage === 0) {
          product.SalesRate = product.Purchase_Rate * 1.03;
          product.Product_MRP =
            product.SalesRate *
            (1 + product.GSTRate / 100) *
            (1 + groupDiscount / 100);
        } else {
          product.SalesRate =
            (product.Purchase_Rate * (100 + product.ProfitPercentage)) / 100;
          product.Product_MRP =
            product.SalesRate *
            (1 + product.GSTRate / 100) *
            (1 + groupDiscount / 100);
        }

        product.purchaseDate = new Date();
        product.partyId.push({
          partyId: req.body.partyId,
          purchaseDate: new Date(),
        });
        product.purchaseStatus = true;
        product.qty += Number(orderItem.qty || 0);

        await addProductInWarehouse3(
          product,
          product.warehouse,
          orderItem,
          req.body.date
        );
        await product.save();
      }
      return true;
    };

    if (date1.toDateString() === date2.toDateString()) {
      await applyForDate();
    } else if (date1 > date2) {
      await applyForDate();
    } else {
      return res.status(400).json({
        message: "can not purchaseOrder of next date",
        status: false,
      });
    }

    // ---------- Create order ----------
    req.body.userId = user._id;
    req.body.database = user.database;

    const order = await PurchaseOrder.create(req.body);
    if (order) {
      const particular = "PurchaseInvoice";
      await ledgerPartyForCredit(order, particular);
    }

    return order
      ? res.status(200).json({ orderDetail: order, status: true })
      : res
          .status(400)
          .json({ message: "Something Went Wrong", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
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
        { new: true }
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
      oldItems.map((item) => [item.productId.toString(), item])
    );
    const newMap = new Map(
      newItems.map((item) => [item.productId.toString(), item])
    );

    const removedItems = oldItems.filter(
      (item) => !newMap.has(item.productId.toString())
    );
    const addedItems = newItems.filter(
      (item) => !oldMap.has(item.productId.toString())
    );

    const updatedItems = newItems.filter((item) =>
      oldMap.has(item.productId.toString())
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
            (p) => p.productId.toString() === oldItem.productId.toString()
          );
          if (whItem) {
            whItem.currentStock += oldItem.qty;
            whItem.totalPrice -= oldItem.totalPrice;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString()
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
            (p) => p.productId.toString() === oldItem.productId.toString()
          );
          if (whItem) {
            whItem.currentStock += oldItem.qty;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === oldItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
          );
          if (whItem) {
            whItem.currentStock -= newItem.qty;
          }
          await warehouse.save();
        }

        if (stock) {
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
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
            (p) => p.productId.toString() === newItem.productId.toString()
          );
          if (whItem) {
            whItem.currentStock -= qtyChange;
          }
          await warehouse.save();
        }

        if (stock) {
          // console.log("stock",stock)
          const sItem = stock.productItems.find(
            (p) => p.productId.toString() === newItem.productId.toString()
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
              item.productId.toString() === orderItem.productId.toString()
          ).price;
        }

        await DeleteStockPurchase(
          orderItem,
          purchase.date,
          previousPurchaseOrders
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
      (pItem) => pItem.productId.toString() === warehouse.productId.toString()
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
      0
    );
    Creditor.currentPurchase = purchaseCurrentMonth.reduce(
      (sum, item) => sum + item.grandTotal,
      0
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
          (item) => item.productId.toString() !== orderItem.productId
        );
        await stock.save();
        break;
      }
    }
  } catch (error) {
    console.log("Error in DeleteStockPurchase:", error);
  }
};
