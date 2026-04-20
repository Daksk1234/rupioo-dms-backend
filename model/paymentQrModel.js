import mongoose from "mongoose";
const paymentQrSchema = new mongoose.Schema(
  {
    partyId: {
      type: String,
    },
    paymentVerified: {
      type: Boolean,
      default: false,
    },
    invoiceId: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: String,
    },
    Time: {
      type: String,
    },
    Date: {
      type: String,
    },
    paymentDetails: {
      type: Object,
    },
    statusQr: {
      type: String,
      default: "Pending",
    },
    paidAmounts: {
      type: Number,
      default: 0,
    },
    database: {
      type: String,
    },
  },
  { timestamps: true },
);
export const PaymentQr = mongoose.model("paymentQr", paymentQrSchema);
