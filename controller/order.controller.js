import dotenv from "dotenv";
import moment from "moment";
import path from "path"
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from "fs"
import pdf from 'html-pdf'
import { User } from "../model/user.model.js";
import { Product } from "../model/product.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { generateInvoice, generateOrderNo } from "../service/invoice.js";
import { getCreateOrderHierarchy, getUserHierarchyBottomToTop } from "../rolePermission/RolePermission.js";
import { Customer } from "../model/customer.model.js";
import { createInvoiceTemplate } from "../Invoice/invoice.js";
import transporter from "../service/email.js";
import { Warehouse } from "../model/warehouse.model.js";
import { UpdateCheckLimitSales, checkLimit } from "../service/checkLimit.js";
import { Ledger } from "../model/ledger.model.js";
import { ClosingStock } from "../model/closingStock.model.js";
import { Receipt } from "../model/receipt.model.js";
import { ledgerPartyForDebit } from "../service/ledger.js";
import { addProductInWarehouse5, addProductInWarehouse6 } from "./product.controller.js";
import { Stock } from "../model/stock.js";
import { CompanyDetails } from "../model/companyDetails.model.js";
// import transporterss from "../service/email.js";
import nodemailer from "nodemailer";
import { Role } from "../model/role.model.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createOrder = async (req, res, next) => {
    try {
        console.log("req.body",req.body)
        const orderItems = req.body.orderItems;
        const date1 = new Date();
        const date2 = new Date(req.body.date);
        const party = await Customer.findById({ _id: req.body.partyId });
        const user = await User.findOne({ _id: party.created_by });
        if (!user) {
            return res.status(401).json({ message: "No user found", status: false });
        }

        if (isNaN(date2.getTime())) {
            return res.status(400).json({ message: "Invalid date format", status: false });
        }

        if (date1.toDateString() === date2.toDateString()) {
            // if (party.paymentTerm.toLowerCase() !== "cash") {
            //     const existOrders = await CreateOrder.find({
            //         partyId: req.body.partyId,
            //         status: { $nin: ['Deactive', 'Cancelled', 'Cancel in process'] },
            //         paymentStatus: false
            //     }).sort({ date: 1, sortorder: -1 });

            // if (existOrders.length > 0) {
            //     const due = existOrders[0];
            //     const lastOrderDate = due?.date;
            //     const currentDate = new Date();
            //     const timeDifference = currentDate - lastOrderDate;
            //     const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            //     if (days >= party.lockInTime) {
            //         return res.status(400).json({ message: "First, you need to pay the previous payment", status: false });
            //     }
            // }
            // }

            const orderNo = await generateOrderNo(user.database);
            for (const orderItem of orderItems) {
                const product = await Product.findById({ _id: orderItem.productId });

                if (!product) {
                    return res.status(404).json({ message: `Product with ID ${orderItem.productId} not found`, status: false });
                }

                product.salesDate = new Date();
                const warehouse = await Warehouse.findById(product.warehouse);

                if (warehouse) {
                    const pro = warehouse.productItems.find((item) => item.productId.toString() === orderItem.productId.toString());

                    if (pro.currentStock < orderItem.qty) {
                        return res.status(400).json({ message: `Not enough stock for product ${orderItem.productId}`, status: false });
                    }

                    pro.currentStock -= orderItem.qty;
                    product.qty -= orderItem.qty;
                    product.pendingQty += orderItem.qty;

                    await addProductInWarehouse6(product, product.warehouse, orderItem, req.body.date);
                    await warehouse.save();  // Save warehouse changes
                    await product.save();    // Save product changes
                }
            }

            const result = await generateInvoice(user.database);
            let challanNo = result;
            let invoiceId = result;
            req.body.challanNo = challanNo;
            req.body.invoiceId = invoiceId;
            req.body.userId = party.created_by;
            req.body.database = user.database;
            req.body.orderNo = orderNo;
            req.body.orderItems = orderItems;

            const savedOrder = await CreateOrder.create(req.body);
            req.body.database = user.database;
            req.body.totalAmount = req.body.grandTotal;
            req.body.orderId = savedOrder._id;
            if (party.paymentTerm === "credit") {
                await checkLimit(req.body);
            }

            return res.status(200).json({ orderDetail: savedOrder, status: true });
        } else {
            return res.status(404).json({ message: "select current date", status: false });
        }
    } catch (err) {
        console.error("Error in createOrder:", err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};

export const createOrderWithInvoice = async (req, res, next) => {
    try {
        console.log("req.body", req.body);
        const orderItems = req.body.orderItems;
        const date1 = new Date();
        const date2 = new Date(req.body.date);
        const party = await Customer.findById({ _id: req.body.partyId })
        const user = await User.findOne({ _id: party.created_by });
        if (!user) {
            return res.status(401).json({ message: "No user found", status: false });
        } else {
            if (date1.toDateString() === date2.toDateString()) {
                for (const orderItem of orderItems) {
                    const product = await Product.findById({ _id: orderItem.productId });
                    if (product) {
                        const warehouse = await Warehouse.findById(product.warehouse)
                        if (warehouse) {
                            const pro = warehouse.productItems.find((item) => item.productId.toString() === orderItem.productId.toString())
                            // pro.currentStock -= (orderItem.qty);
                            product.qty -= orderItem.qty;
                            await warehouse.save();
                            await product.save()
                            await addProductInWarehouse5(product, product.warehouse, orderItem, req.body.date)
                        }
                    } else {
                        console.error(`Product with ID ${orderItem.productId} not found`);
                    }
                }
                req.body.status = "completed"
                req.body.userId = party.created_by
                req.body.database = user.database
                // console.log("party after",party.remainingLimit)
                // console.log("req.body.grandTotal",req.body.grandTotal)
                party.remainingLimit -= req.body.grandTotal;
                await party.save()
                // console.log("party before",party.remainingLimit)

                const savedOrder = await CreateOrder.create(req.body)
                if (savedOrder) {
                    const particular = "SalesInvoice";
                    await ledgerPartyForDebit(savedOrder, particular)
                }
                return res.status(200).json({ orderDetail: savedOrder, status: true });
            } else if (date1 > date2) {
                for (const orderItem of orderItems) {
                    const product = await Product.findById({ _id: orderItem.productId });
                    if (product) {
                        const warehouse = await Warehouse.findById(product.warehouse)
                        if (warehouse) {
                            const pro = warehouse.productItems.find((item) => item.productId.toString() === orderItem.productId.toString())
                            product.qty -= orderItem.qty;
                            await warehouse.save();
                            await product.save()
                            await addProductInWarehouse5(product, product.warehouse, orderItem, req.body.date)
                        }
                    } else {
                        console.error(`Product with ID ${orderItem.productId} not found`);
                    }
                }
                req.body.status = "completed"
                req.body.userId = party.created_by
                req.body.database = user.database
                req.body.paymentStatus = true;
                party.remainingLimit -= req.body.grandTotal;
                await party.save()
                const savedOrder = await CreateOrder.create(req.body)
                if (savedOrder) {
                    const particular = "SalesInvoice";
                    await ledgerPartyForDebit(savedOrder, particular)
                }
                return res.status(200).json({ orderDetail: savedOrder, status: true });
            } else {
                return res.status(400).json({ message: "can not purchaseOrder of next date", status: false })
            }
        }
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};
export const createOrderHistoryByUserId = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const orders = await CreateOrder.find({ userId: userId }).populate({ path: 'orderItems.productId', model: 'product' }).populate({ path: "partyId", model: "customer" }).exec();
        if (!orders || orders.length === 0) {
            return res.status(404).json({ message: "No orders found for the user", status: false });
        }
        const formattedOrders = orders.map(order => {
            const formattedOrderItems = order.orderItems.map(item => ({
                product: item.productId,
                qty: item.qty,
                unitType: item.unitType,
                price: item.price,
                status: item.status
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
                updatedAt: order.updatedAt
            };
        });
        return res.status(200).json({ orderHistory: formattedOrders, status: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: err });
    }
};
export const createOrderHistoryById = async (req, res, next) => {
    try {
        const orders = await CreateOrder.findById(req.params.id).populate({ path: 'orderItems.productId', model: 'product' }).populate({ path: "partyId", model: "customer" }).exec();
        return res.status(200).json({ orderHistory: orders, status: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: err });
    }
};
export const deleteSalesOrder = async (req, res, next) => {
    try {
        const order = await CreateOrder.findById(req.params.id)
        if (!order) {
            return res.status(404).json({ error: "Not Found", status: false });
        }
        if (order.status === "completed") {
            return res.status(400).json({ error: "this order not deleted", status: false });
        }
        for (const orderItem of order.orderItems) {
            const product = await Product.findById({ _id: orderItem.productId });
            if (product) {
                const warehouse = await Warehouse.findById(product.warehouse)
                if (warehouse) {
                    const pro = warehouse.productItems.find((item) => item.productId === orderItem.productId.toString())
                    if (pro) {
                        pro.currentStock += (orderItem.qty);
                        product.qty += orderItem.qty;
                        product.pendingQty -= orderItem.qty;
                        await deleteProductInStock(product, product.warehouse, orderItem, order.date)
                        await warehouse.save();
                        await product.save()
                    }
                }
            } else {
                console.error(`Product With ID ${orderItem.productId} Not Found`);
            }
        }
        await UpdateCheckLimitSales(order)
        order.status = "Deactive";
        await order.save();
        const companyDetails = await CompanyDetails.findOne({ database: order.database })
        if (companyDetails) {
            companyDetails.cancelInvoice.push({ invoice: order.invoiceId })
            await companyDetails.save();
        }
        return res.status(200).json({ message: "delete successfull!", status: true })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
}
export const createOrderHistoryByPartyId = async (req, res, next) => {
    try {
        const orders = await CreateOrder.findById(req.params.id).populate({ path: 'orderItems.productId', model: 'product' }).populate({ path: "partyId", model: "customer" }).populate({ path: "userId", model: "user" })
        if (!orders) {
            return res.status(404).json({ message: "No orders found for the user", status: false });
        }
        let partyId;
        if (orders.partyId) {
            partyId = await Customer.findById(orders.partyId._id).populate({ path: 'category', model: "customerGroup" });
            if (!partyId) {
                console.log("Party details not found");
            }
        } else {
            console.log("Party ID not found in orders");
        }
        return res.status(200).json({ orderHistory: { ...orders.toObject(), partyId: undefined, partyId }, status: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: err });
    }
};
export const OrdertoBilling = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await CreateOrder.findById({ _id: orderId })
        if (!order) {
            return res.status(404).json({ message: 'Sales Order Not Found', status: false });
        }
        for (const orderItem of req.body.orderItems) {
            const product = await Product.findById({ _id: orderItem.productId });
            if (product) {
                product.salesDate = new Date()
                const warehouse = await Warehouse.findById(orderItem.warehouse)
                if (warehouse) {
                    const pro = warehouse.productItems.find((item) => item.productId.toString() === orderItem.productId.toString())
                    pro.currentStock -= (orderItem.qty);
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
        return res.status(200).json({ message: "Order Billing Seccessfull!", Order: order, status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};

// Order To Dispatch
export const OrdertoDispatch = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await CreateOrder.findById({ _id: orderId })
        if (!order) {
            return res.status(404).json({ message: 'Sales Order Not Found', status: false });
        }
        for (const orderItem of order.orderItems) {
            if (orderItem.warehouse.toString() === req.body.warehouse.toString()) {
                orderItem.status = "Dispatch";
            }
        }
        if (order.NoOfPackage) {
            order.NoOfPackage += req.body.NoOfPackage
        } else {
            order.NoOfPackage = req.body.NoOfPackage
        }
        for (const orderItem of order.orderItems) {
            if (orderItem.status === "Dispatch") {
                order.status = "Dispatch"
            }
            else {
                order.status = "Billing"
            }
        }
        const orders = await order.save();
        return res.status(200).json({ message: "Order Dispatch Seccessfull!", Order: orders, status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};
// Order To Dispatch
export const DispatchOrderCancelFromWarehouse = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await CreateOrder.findById({ _id: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Sales Order Not Found', status: false });
        }
        order.status = "pending";
        order.Remark = req.body.Remark;
        const orders = await order.save();
        return res.status(200).json({ message: "Order Dispatch Cancel Seccessfull!", Order: orders, status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error", status: false });
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


export const updateCreateOrder = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const updatedFields = req.body;

        if (!orderId || !updatedFields) {
            return res.status(400).json({ message: "Invalid input data", status: false });
        }

        const party = await Customer.findById({ _id: updatedFields.partyId });
        if (!party) {
            return res.json({ message: "Party Not Found", status: false });
        }

        const order = await CreateOrder.findById({ _id: orderId });
        if (!order) {
            return res.status(404).json({ message: "Order not found", status: false });
        }

        const oldItems = order.orderItems || [];
        const newItems = updatedFields.orderItems || [];

        const oldMap = new Map(oldItems.map(item => [item.productId.toString(), item]));
        const newMap = new Map(newItems.map(item => [item.productId.toString(), item]));

        const removedItems = oldItems.filter(item => !newMap.has(item.productId.toString()));
        const addedItems = newItems.filter(item => !oldMap.has(item.productId.toString()));

        const updatedItems = newItems.filter(item => oldMap.has(item.productId.toString()));

        const isCompleted = order.status === 'completed';

        for (const oldItem of removedItems) {
            // console.log("oldeItem remove", oldItem)
            const product = await Product.findById({ _id: oldItem.productId });
            if (!product) continue;

            const warehouse = await Warehouse.findById({ _id: product.warehouse });
            const stock = await Stock.findOne({ warehouseId: product.warehouse.toString(), date: updatedFields.date });

            if (isCompleted) {
                product.qty += oldItem.qty;

                if (warehouse) {
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === oldItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock += oldItem.qty;
                        whItem.totalPrice -= oldItem.totalPrice;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    const sItem = stock.productItems.find(p => p.productId.toString() === oldItem.productId.toString());
                    if (sItem) {
                        sItem.currentStock += oldItem.qty;
                        sItem.sQty -= oldItem.qty;
                        sItem.sTotal -= oldItem.totalPrice;
                        await stock.save();
                    }
                }
            } else {
                product.qty += oldItem.qty;
                product.pendingQty -= oldItem.qty;

                if (warehouse) {
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === oldItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock += oldItem.qty;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    const sItem = stock.productItems.find(p => p.productId.toString() === oldItem.productId.toString());
                    if (sItem) {
                        sItem.pendingStock -= oldItem.qty;
                        sItem.currentStock += oldItem.qty;
                        sItem.pendingStockTotal -= oldItem.totalPrice;
                        await stock.save();
                    }
                }
            }

            party.remainingLimit += oldItem.totalPrice;
            await product.save();
        }

        for (const newItem of addedItems) {
            console.log("add newItem", newItem)
            const product = await Product.findById({ _id: newItem.productId });
            if (!product) continue;

            const warehouse = await Warehouse.findById({ _id: product.warehouse });
            const stock = await Stock.findOne({ warehouseId: product.warehouse.toString(), date: updatedFields.date });

            if (isCompleted) {
                product.qty -= newItem.qty;

                if (warehouse) {
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock -= newItem.qty;
                        whItem.totalPrice += newItem.totalPrice;
                        whItem.transferQty += newItem.qty;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    const sItem = stock.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (sItem) {
                        sItem.currentStock -= newItem.qty;
                        sItem.sQty += newItem.qty;
                        sItem.sTotal += newItem.totalPrice;
                        await stock.save();
                    }
                }
            } else {
                product.qty -= newItem.qty;
                product.pendingQty += newItem.qty;

                if (warehouse) {
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock -= newItem.qty;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    const sItem = stock.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (sItem) {
                        sItem.pendingStock += newItem.qty;
                        sItem.currentStock -= newItem.qty;
                        sItem.pendingStockTotal += newItem.totalPrice;
                        await stock.save();
                    }
                }
            }

            party.remainingLimit -= newItem.totalPrice;
            await product.save();
        }

        for (const newItem of updatedItems) {
            console.log("update same newItem", newItem)

            const oldItem = oldMap.get(newItem.productId.toString());
            const qtyChange = newItem.qty - oldItem.qty;
            const priceChange = newItem.totalPrice - oldItem.totalPrice;

            if (qtyChange === 0 && priceChange === 0) continue;

            const product = await Product.findById({ _id: newItem.productId });
            if (!product) continue;

            const warehouse = await Warehouse.findById({ _id: product.warehouse });
            const stock = await Stock.findOne({ warehouseId: product.warehouse.toString(), date: updatedFields.date });

            if (isCompleted) {
                product.qty -= qtyChange;

                if (warehouse) {
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock -= qtyChange;
                        whItem.totalPrice += priceChange;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    const sItem = stock.productItems.find(p => p.productId.toString() === newItem.productId.toString());
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
                    const whItem = warehouse.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    if (whItem) {
                        whItem.currentStock -= qtyChange;
                    }
                    await warehouse.save();
                }

                if (stock) {
                    // console.log("stock",stock)
                    const sItem = stock.productItems.find(p => p.productId.toString() === newItem.productId.toString());
                    // console.log("sitem",sItem)
                    if (sItem) {
                        sItem.currentStock -= qtyChange
                        sItem.pendingStock += qtyChange;
                        sItem.pendingStockTotal += priceChange;
                        await stock.save();
                    }
                }
            }

            party.remainingLimit -= priceChange;
            await product.save();
        }

        const ledger = await Ledger.findOne({ partyId: updatedFields.partyId, date: updatedFields.date, particular: "SalesInvoice" });
        if (ledger) {
            ledger.debit = updatedFields.grandTotal;
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


export const SalesOrderList = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const database = req.params.database;
        const adminDetail = await getUserHierarchyBottomToTop(userId, database)
        if (!adminDetail.length > 0) {
            return res.status(404).json({ error: "Product Not Found", status: false })
        }
        const createOrder = await CreateOrder.find({ database: database }).populate({
            path: 'orderItems.productId',
            model: 'product'
        }).populate({ path: "partyId", model: "customer" }).exec();
        if ((!createOrder || createOrder.length === 0)) {
            return res.status(404).json({ message: "No orders found", status: false });
        }
        return res.status(200).json({ orderHistory: createOrder, status: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};
export const createOrderHistory = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const adminDetail = await getCreateOrderHierarchy(userId)
        return (adminDetail.length > 0) ? res.status(200).json({ orderHistory: adminDetail, status: true }) : res.status(400).json({ message: "Not Found", status: false })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};
export const updateCreateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        const order = await CreateOrder.findById({ _id: orderId }).populate({ path: "userId", model: "user" }).populate({ path: "partyId", model: "customer" }).populate({ path: "orderItems.productId", model: "product" });
        if (!order) {
            return res.status(404).json({ message: 'sales order not found' });
        }
        order.status = status;
        await order.save();
        const timestamp = new Date().toISOString().replace(/[-:]/g, '');
        const invoiceFilename = `invoice_${timestamp}.pdf`;
        const pdfFilePath = path.resolve(__dirname, invoiceFilename);
        await new Promise((resolve, reject) => {
            pdf.create(createInvoiceTemplate(order), {}).toFile(pdfFilePath, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
        const attachment = fs.readFileSync(pdfFilePath).toString("base64");
        await transporter.sendMail({
            from: process.env.EMAIL,
            to: order.partyId.email,
            subject: 'Pdf Generate document',
            html: 'Testing Pdf Generate document, Thanks.',
            attachments: [
                {
                    content: attachment,
                    filename: invoiceFilename,
                    contentType: 'application/pdf',
                    path: pdfFilePath
                }
            ]
        }, function (error, info) {
            if (error) {
                console.log(error);
            } else {
                fs.unlinkSync(pdfFilePath);
                res.send("Mail has been sent to your email. Check your mail");
            }
        });
        return res.status(200).json({ Order: order, status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error, status: false });
    }
};
export const checkPartyOrderLimit = async (req, res, next) => {
    try {
        // const party = await PartyOrderLimit.findOne({ partyId: req.params.id })
        const party = await Customer.findById(req.params.id)
        if (party) {
            // console.log("party",party)
            const CustomerLimit = (party.remainingLimit > 0) ? party.remainingLimit : party.limit;
            // const CustomerLimit = (party.remainingLimit > 0) ? party.remainingLimit+party.AdvanceAmount : party.limit;
            // console.log("CustomerLimit",CustomerLimit)
            return res.status(200).json({ CustomerLimit, message: `The limit on your order amount is ${CustomerLimit}`, status: true })
        } else {
            return res.status(404).json({ message: "Party Not Found", status: true })
        }
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false })
    }
}
export const ProductWiseSalesReport = async (req, res, next) => {
    try {
        const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
        const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
        const targetQuery = { database: req.params.database };
        if (startDate && endDate) {
            targetQuery.createdAt = { $gte: startDate, $lte: endDate };
        }
        let orders = [];
        const salesOrder = await CreateOrder.find(targetQuery).populate({ path: "orderItems.productId", model: "product" });
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
        return res.status(200).json({ Orders: uniqueOrders, status: true })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};
// Order History App
export const ViewOrderHistoryForPartySalesPerson = async (req, res, next) => {
    try {
        const orders = await CreateOrder.find({ partyId: req.params.id, status: { $ne: "Deactive" } }).populate({ path: 'orderItems.productId', model: 'product' }).populate({ path: "userId", model: "user" }).populate({ path: "partyId", model: "customer" })
        return res.status(200).json({ orderHistory: orders, status: true })
    }
    catch (err) {
        console.log(err)
        return res.status(500).json({ error: "Internal Server Error", status: false })
    }
}

//  For DashBoard
export const SalesOrderCalculate111 = async (req, res, next) => {
    try {
        let salesOrders = {
            totalAmount: 0,
            lastMonthAmount: 0,
            averageAmount: 0,
            totalPending: 0,
            totalDelivery: 0
        };
        const previousMonthStart = moment().subtract(1, 'months').startOf('month').toDate();
        const previousMonthEnd = moment().subtract(1, 'months').endOf('month').toDate();
        const order = await CreateOrder.find({ database: req.params.database }).sort({ sortorder: -1 })
        if (order.length === 0) {
            return res.status(404).json({ message: "Sales Order Not Found", status: false })
        }
        const lastMonth = order[0].createdAt.getMonth() + 1
        for (let item of order) {
            if (item.status === "Completed") {
                salesOrders.totalAmount += item.grandTotal
            }
            if (item.status === "pending") {
                salesOrders.totalPending++
            }
            if (item.status === "Pending for Delivery") {
                salesOrders.totalDelivery++
            }
        }
        const orders = await CreateOrder.find({
            database: req.params.database, status: "Completed",
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
        });
        if (orders.length === 0) {
            return res.status(404).json({ message: "Sales Order Not Found", status: false })
        }
        for (let item of orders) {
            salesOrders.lastMonthAmount += item.grandTotal
        }
        salesOrders.averageAmount = (salesOrders.totalAmount / lastMonth).toFixed(2)
        res.status(200).json({ salesOrders, status: true })
    }
    catch (err) {
        console.log(err)
        return res.status(500).json({ error: "Internal Server Error", status: false })
    }
}
export const SalesOrderCalculate = async (req, res, next) => {
    try {
        const { id, database } = req.params;
        let salesOrders = {
            totalAmount: 0,
            lastMonthAmount: 0,
            averageAmount: 0,
            totalPending: 0,
            totalDelivery: 0
        };

        // Find user or customer
        const user = await User.findById(id).populate({ path: "rolename", model: "role" });
        const customer = await Customer.findById(id).populate({ path: "rolename", model: "role" });

        if (!user && !customer) {
            return res.status(404).json({ message: "User or Customer Not Found", status: false });
        }

        const existingUser = user || customer;
        const roleName = existingUser?.rolename?.roleName;

        // Time boundaries for the last month
        const previousMonthStart = moment().subtract(1, 'months').startOf('month').toDate();
        const previousMonthEnd = moment().subtract(1, 'months').endOf('month').toDate();

        // Fetch all orders for the given database
        let allOrders = await CreateOrder.find({ database }).sort({ sortorder: -1 });

        // Filter orders based on role
        let filteredOrders = [];

        if (roleName === "SuperAdmin" || roleName === "Sales Manager") {
            filteredOrders = allOrders;
        } else if (roleName === "Sales Person") {
            // Match orders by userId
            filteredOrders = allOrders.filter(order =>
                order.userId?.toString() === existingUser._id.toString()
            );
        } else if (roleName === "Customer") {
            // Match orders by partyId
            filteredOrders = allOrders.filter(order =>
                order.partyId?.toString() === existingUser._id.toString()
            );
        } else {
            return res.status(403).json({ message: "Unauthorized Role", status: false });
        }

        if (filteredOrders.length === 0) {
            return res.status(404).json({ message: "No orders found for the user", status: false });
        }

        // Calculation
        let completedOrdersLastMonth = [];
        const distinctMonths = new Set();

        for (let order of filteredOrders) {
            const orderDate = moment(order.date);
            distinctMonths.add(orderDate.format('YYYY-MM'));

            if (order.status.toLowerCase() === "completed") {
                salesOrders.totalAmount += order.grandTotal;

                if (orderDate.isBetween(previousMonthStart, previousMonthEnd, null, '[]')) {
                    completedOrdersLastMonth.push(order);
                }
            } else if (order.status.toLowerCase() === "pending") {
                salesOrders.totalPending++;
            } else if (order.status.toLowerCase() === "pending for delivery") {
                salesOrders.totalDelivery++;
            }
        }

        completedOrdersLastMonth.forEach(order => {
            salesOrders.lastMonthAmount += order.grandTotal;
        });

        // Avoid division by zero
        const totalMonths = distinctMonths.size || 1;
        salesOrders.averageAmount = (salesOrders.totalAmount / totalMonths).toFixed(2);

        return res.status(200).json({ SalesCalculation: salesOrders, status: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
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
            totalOutstanding: 0
        };
        const startOfDay = moment().startOf('month').toDate();
        const endOfDay = moment().endOf('month').toDate();
        const [salesOrder, salesOrderCurrentMonth, receipt, receipts] = await Promise.all([
            CreateOrder.find({ database: req.params.database, status: "completed" }).sort({ sortorder: -1 }),
            CreateOrder.find({ database: req.params.database, status: "completed", date: { $gte: startOfDay, $lte: endOfDay } }).sort({ sortorder: -1 }),
            Receipt.find({ database: req.params.database, type: "receipt", status: "Active" }).sort({ sortorder: -1 }),
            Receipt.find({ database: req.params.database, type: "receipt", date: { $gte: startOfDay, $lte: endOfDay }, status: "Active" }).sort({ sortorder: -1 })
        ]);
        Debtor.totalDue = salesOrder.reduce((sum, item) => sum + item.grandTotal, 0);
        let currentSales = salesOrderCurrentMonth.reduce((sum, item) => sum + item.grandTotal, 0);
        Debtor.totalReceipt = receipt.reduce((sum, item) => sum + item.amount, 0);
        Debtor.currentReceipt = receipts.reduce((sum, item) => sum + item.amount, 0);

        res.status(200).json({ Debtor, status: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
};

// --------------------------------------------
export const deletedSalesOrder = async (req, res, next) => {
    try {
        const order = await CreateOrder.findById(req.params.id)
        if (!order) {
            return res.status(404).json({ error: "Not Found", status: false });
        }
        for (const orderItem of order.orderItems) {
            const product = await Product.findById({ _id: orderItem.productId });
            if (product) {
                const warehouse = await Warehouse.findById(product.warehouse)
                if (warehouse) {
                    const pro = warehouse.productItems.find((item) => item.productId === orderItem.productId.toString())
                    pro.currentStock += (orderItem.qty);
                    product.qty += orderItem.qty;
                    product.pendingQty -= orderItem.qty;
                    await warehouse.save();
                    await product.save()
                }
                await revertOutWordStock(orderItem, order.date)

            } else {
                console.error(`Product With ID ${orderItem.productId} Not Found`);
            }
        }
        // if (order.status === "completed") {
        //     const party = await Customer.findById(order.partyId)
        //     party.remainingLimit += order.grandTotal;
        //     await party.save()
        // }
        await UpdateCheckLimitSales(order)
        order.status = "Deactive";
        await order.save();

        await Ledger.findOneAndDelete({ orderId: req.params.id })
        const companyDetails = await CompanyDetails.findOne({ database: order.database })
        if (companyDetails) {
            companyDetails.cancelInvoice.push({ invoice: order.invoiceId })
            await companyDetails.save();
        }
        return res.status(200).json({ message: "delete successfull!", status: true })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
}
export const deletedSalesOrderMultiple = async (req, res, next) => {
    try {
        const { sales } = req.body;
        for (let item of sales) {
            const order = await CreateOrder.findById(item)
            if (!order) {
                return res.status(404).json({ error: "Not Found", status: false });
            }
            for (const orderItem of order.orderItems) {
                const product = await Product.findById({ _id: orderItem.productId });
                if (product) {
                    const warehouse = await Warehouse.findById(orderItem.warehouse)
                    if (warehouse) {
                        const pro = warehouse.productItems.find((item) => item.productId === orderItem.productId.toString())
                        pro.currentStock += (orderItem.qty);
                        product.qty += orderItem.qty;
                        product.pendingQty -= orderItem.qty;
                        await warehouse.save();
                        await product.save()
                    }
                    // console.log("orderItem",orderItem)
                    // console.log("date",order.date)
                    await revertOutWordStock(orderItem, order.date)

                } else {
                    console.error(`Product With ID ${orderItem.productId} Not Found`);
                }
            }
            // console.log("order",order)
            if (order.status === "completed") {
                const party = await Customer.findById(order.partyId)
                party.remainingLimit += order.grandTotal;
                await party.save()
            }
            await UpdateCheckLimitSales(order)
            order.status = "Deactive";
            await order.save();
            // console.log("totalssss",party.remainingLimit)

            await Ledger.findOneAndDelete({ orderId: req.params.id })
            const companyDetails = await CompanyDetails.findOne({ database: order.database })
            if (companyDetails) {
                companyDetails.cancelInvoice.push({ invoice: order.invoiceId })
                await companyDetails.save();
            }
        }
        return res.status(200).json({ message: "delete successfull!", status: true })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
}
export const deleteProductInStock = async (warehouse, warehouseId, orderItem, date) => {
    try {
        const dates = new Date(date);
        const startOfDay = new Date(dates);
        const endOfDay = new Date(dates);
        startOfDay.setUTCHours(0, 0, 0, 0);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const stock = await Stock.find({ warehouseId: warehouseId.toString(), date: { $gte: startOfDay } });
        if (stock.length === 0) {
            return console.log("warehouse not found");
        } else {
            for (let item of stock) {
                const existingStock = item.productItems.find((item) => item.productId.toString() === warehouse._id.toString())
                if (existingStock) {
                    if (item.date.toDateString() === dates.toDateString()) {
                        existingStock.pendingStock -= orderItem.qty
                        existingStock.currentStock += orderItem.qty
                        existingStock.totalPrice -= (orderItem.qty * orderItem.price);
                        existingStock.rQty += orderItem.qty
                        item.markModified('productItems');
                        await item.save();
                    } else {
                        existingStock.currentStock += orderItem.qty
                        existingStock.totalPrice -= (orderItem.qty * orderItem.price);
                        // existingStock.rQty += orderItem.qty
                        item.markModified('productItems');
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
        let tax = 0
        const rate = parseInt(orderItem.gstPercentage) / 2;
        if (orderItem.igstTaxType === false) {
            cgstRate = (((orderItem.qty) * orderItem.price) * rate) / 100;
            sgstRate = (((orderItem.qty) * orderItem.price) * rate) / 100;
            tax = cgstRate + sgstRate
        } else {
            igstRate = (((orderItem.qty) * orderItem.price) * parseInt(orderItem.gstPercentage)) / 100;
            tax = igstRate
        }
        const stock = await ClosingStock.findOne({ warehouseId1: warehouse, productId: orderItem.productId })
        if (stock) {
            stock.sQty -= (orderItem.qty);
            stock.sBAmount -= orderItem.totalPrice;
            stock.sTaxRate -= tax;
            stock.sTotal -= (orderItem.totalPrice + tax)
            await stock.save()
        }
    }
    catch (err) {
        console.log(err)
    }
}

// For Customer Target, Purchase Product Qty By Customer
export const PartyPurchaseqty = async (req, res, next) => {
    try {
        const previousMonthStart = moment().subtract(1, 'months').startOf('month').toDate();
        const previousMonthEnd = moment().subtract(1, 'months').endOf('month').toDate();
        let qty = 0;
        const partyOrder = await CreateOrder.find({
            partyId: req.params.partyId,
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
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
        return res.status(500).json({ error: "Internal Server Error", status: false });
    }
}

export const CheckPartyPayment = async (req, res, next) => {
    try {
        let amount = 100000
        const Orders = await CreateOrder.find({ partyId: "66e42d7b3e4aac5818e47e1a", paymentStatus: { $ne: true } })
        if (Orders.length === 0) {
            return res.status(404).json({ message: "Order's Not Found", status: false })
        }
        for (let item of Orders) {
            const remaining = amount - item.grandTotal;
            console.log("-------------------------------")
            console.log(item.grandTotal)
            console.log("-------------------------------")
            if (remaining < 0) {
                console.log("Negetive Value", item.grandTotal)
                return false
            } else {
                console.log("Positive ", item.grandTotal)
                amount = remaining
                console.log(remaining)
                Orders.paymentStatus = true;
                console.log(Orders.paymentStatus)
            }
        }
    }
    catch (err) {
        console.log(err)
    }
}
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
            CNQty
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
    <p style="font-size:1.5em; font-weight:500;">Hi ${partyName || "Customer"},</p>
    <p>${title || "Thank you for your purchase. Please find your invoice details below."}</p>

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

      ${CNDate || CNNumber || CNQty ? `
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
      </tr>` : ""}
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
        return res.status(200).json({ message: "Invoice sent successfully", status: true });

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
        const order = await CreateOrder.findById(req.params.id)
        if (!order) {
            return res.json({ message: "Sales Invoice Not Found", status: false })
        }
        order.ARN = ARN;
        await order.save();
        res.status(200).json({ message: "Data Updated", status: true })
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false,
        });
    }
}

export const updateCNDetails = async (req, res, next) => {
    try {
        const order = await CreateOrder.findById(req.params.id)
        if (!order) {
            return res.json({ message: "Sales Invoice Not Found", status: false })
        }
        if (req.file && req.file.filename) {
            order.CNImage = req.file.filename;
        }
        const { CNNumber, CNDate, CNQty } = req.body;
        order.CNNumber = CNNumber;
        order.CNDate = CNDate;
        order.CNQty = CNQty;
        await order.save();
        res.status(200).json({ message: "Data Updated", status: true })
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false,
        });
    }
}

export const InvoiceIdFrom = async (req, res, next) => {
    try {
        const { database, invoiceId } = req.params;
        let invoice;
        invoice = await CreateOrder.findOne({ database: database, invoiceId: invoiceId, status: "completed" }).populate({
            path: 'orderItems.productId',
            model: 'product'
        }).populate({ path: "userId", model: "user" }).populate({ path: "partyId", model: "customer" }).populate({ path: "warehouseId", model: "warehouse" }).exec();
        if(!invoice){
            invoice = await PurchaseOrder.findOne({ database: database, invoiceId: invoiceId, status: "completed" }).populate({
            path: 'orderItems.productId',
            model: 'product'
        }).populate({ path: "userId", model: "user" }).populate({ path: "partyId", model: "customer" }).exec();
        }
        return invoice ? res.status(200).json({ message: "Data Found", printData: invoice, status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal Server Error", status: false })
    }
}