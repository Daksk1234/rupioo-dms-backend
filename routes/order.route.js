import express from "express";
import path from "path";
import multer from "multer";
import {
  CheckPartyPayment,
  createOrderGstBuckets,
  DebitorCalculate,
  DispatchOrderCancelFromWarehouse,
  InvoiceIdFrom,
  OrdertoBilling,
  OrdertoDispatch,
  PartyPurchaseqty,
  ProductWiseSalesReport,
  SalesOrderCalculate,
  SalesOrderList,
  ViewOrderHistoryForPartySalesPerson,
  checkPartyOrderLimit,
  createOrder,
  createOrderHistory,
  createOrderHistoryById,
  createOrderHistoryByPartyId,
  createOrderHistoryByUserId,
  createOrderWithInvoice,
  deleteSalesOrder,
  deletedSalesOrder,
  deletedSalesOrderMultiple,
  invoicePartySend,
  updateCNDetails,
  updateCreateOrder,
  updateCreateOrderStatus,
  paymentDetails,
  updateOrderArn,
  verifyFinalPayment,
  verifyPaymentMode,
  verifyQrPayment,
} from "../controller/order.controller.js";

const router = express.Router();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/Images/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + fileExtension);
  },
});
const upload = multer({ storage: storage });

router.post("/save-create-order", createOrder);
router.post("/save-sales-invoice-order", createOrderWithInvoice);
router.get("/view-create-order-history/:id", createOrderHistory);
router.get("/view-create-order-history-gstr1/:id", createOrderGstBuckets);
router.get("/view-create-order-history-by-id/:id", createOrderHistoryByUserId);
router.delete("/delete-sales-order/:id", deleteSalesOrder);
router.get("/view-sales-by-id/:id", createOrderHistoryByPartyId);
router.put("/update-create-order/:id", updateCreateOrder);
router.put("/update-create-order-status/:id", updateCreateOrderStatus);
router.post("/order-billing/:id", OrdertoBilling);
router.post("/order-dispatch/:id", OrdertoDispatch);
router.post("/order-dispatch-cancel/:id", DispatchOrderCancelFromWarehouse);
router.get("/sales-order-by-id/:id", createOrderHistoryById);
router.get("/view-sales-order/:id/:database", SalesOrderList);
router.get("/view-order-party/:id", ViewOrderHistoryForPartySalesPerson);

router.get("/check-party-limit/:id", checkPartyOrderLimit);
router.post("/product-sales-report/:database", ProductWiseSalesReport);

router.delete("/delete-sales/:id", deletedSalesOrder);
router.delete("/delete-multiple", deletedSalesOrderMultiple);
router.get("/party-qty/:partyId/:productId", PartyPurchaseqty);

// --------------------------------------------------------------
router.get("/sales-calculated/:database/:id", SalesOrderCalculate);
router.get("/debitor-calculate/:database", DebitorCalculate);
router.get("/testing/:database", CheckPartyPayment);
router.post("/send-invoice", upload.single("invoice"), invoicePartySend);
router.put("/update-arn/:id", updateOrderArn);
router.put("/update-cndetails/:id", upload.single("CNImage"), updateCNDetails);
router.get("/view-invoice-data/:database/:invoiceId", InvoiceIdFrom);
router.post("/qrcode-payment", verifyQrPayment);
router.get("/view-payment-details/:database", paymentDetails);
router.post("/first-step-payment", verifyPaymentMode);
router.post("/final-verification", verifyFinalPayment);
export default router;
