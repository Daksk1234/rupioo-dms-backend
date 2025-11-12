// models/challan.model.js
import mongoose from "mongoose";

/* ---------- Line Items ---------- */
const orderItemsSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "product" },
  Size: { type: Number },
  qty: { type: Number },
  price: { type: Number },
  totalPrice: { type: Number },
  sgstTotal: { type: Number },
  cgstTotal: { type: Number },
  igstTotal: { type: Number },
  taxableAmount: { type: Number },
  grandTotal: { type: String },
  unitType: { type: String },
  discountPercentage: { type: Number },
  gstPercentage: { type: Number },
  totalPriceWithDiscount: { type: Number },
  warehouse: { type: String },
  status: { type: String, default: "ordered" },
});

/* ---------- Challan (uses your provided fields) ---------- */
const ChallanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    database: { type: String },

    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "customer" },

    challanId: { type: String }, // human-readable challan code/series

    date: { type: Date, default: Date.now },
    DateofDelivery: { type: String },

    fullName: { type: String },
    address: { type: String },
    MobileNo: { type: Number },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    landMark: { type: String },
    pincode: { type: Number },

    grandTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 }, // percent or absolute depending on controller logic
    shippingCost: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },

    status: { type: String, default: "pending" }, // pending/forwarded/dispatch/completed/cancel/Deactive

    latitude: { type: String },
    longitude: { type: String },
    currentAddress: { type: String },

    paymentId: { type: String },
    paymentMode: { type: String },
    reason: { type: String },

    roundOff: { type: Number },
    amount: { type: Number }, // taxable (basic after discounts + charges before GST)

    sgstTotal: { type: Number },
    cgstTotal: { type: Number },
    igstTotal: { type: Number },

    discountAmount: { type: Number },
    igstTaxType: { type: Number }, // 1 = IGST, else split to CGST/SGST

    orderItems: [orderItemsSchema],

    gstDetails: [
      {
        hsn: { type: String },
        taxable: { type: Number },
        centralTax: [{ rate: { type: Number }, amount: { type: Number } }],
        stateTax: [{ rate: { type: Number }, amount: { type: Number } }],
        igstTax: [{ rate: { type: Number }, amount: { type: Number } }],
        discountPercentage: { type: Number },
        withoutDiscountAmount: { type: Number },
        withDiscountAmount: { type: Number },
        withoutTaxablePrice: { type: Number },
      },
    ],

    transporter: { type: Object },

    otherCharges: { type: Number },
    gstOtherCharges: [],

    NoOfPackage: { type: Number },

    deletedAt: { type: Date }, // soft delete marker
  },
  { timestamps: true }
);

// Helpful indexes
ChallanSchema.index({ challanId: 1, database: 1 }, { unique: false });
ChallanSchema.index({ status: 1, database: 1, createdAt: -1 });

export const Challan = mongoose.model("challan", ChallanSchema);
