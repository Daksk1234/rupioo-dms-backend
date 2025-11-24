import mongoose from "mongoose";

/* -------- Line item schema -------- */
const orderItemsSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "product" },

    Size: { type: Number },
    qty: { type: Number },
    price: { type: Number },
    totalPrice: { type: Number },

    sgstRate: { type: Number },
    cgstRate: { type: Number },
    igstRate: { type: Number },

    taxableAmount: { type: Number },
    grandTotal: { type: Number },

    unitType: { type: String },
    discountPercentage: { type: Number },

    // 🔁 frontend sends numeric GST% — store as Number
    gstPercentage: { type: Number },

    totalPriceWithDiscount: { type: Number },

    status: { type: String, default: "ordered" },
    date: { type: Date },

    // already boolean in items (keep)
    igstTaxType: { type: Boolean },

    basicPrice: { type: Number },
    landedCost: { type: Number },

    primaryUnit: { type: String },
    secondaryUnit: { type: String },
    secondarySize: { type: Number },

    ReceiveQty: { type: String },
    DamageQty: { type: String },
  },
  { timestamps: true }
);

/* -------- Bill-level Discount/Charge row schema (applied) -------- */
const adjustmentRowSchema = new mongoose.Schema(
  {
    id: String, // master _id (if selected from master)
    title: String, // name from master (or custom)
    type: String, // "Discount" | "Charge"
    discounttype: String, // "Percentage" | "Amount"
    percentage: Number, // % value (if percentage)
    amount: Number, // absolute amount (if amount)
    appliedAmount: Number, // what was actually applied on this bill
  },
  { _id: false }
);

/* -------- Optional compact HSN summary persisted for audit -------- */
const hsnSummaryRowSchema = new mongoose.Schema(
  {
    hsn: String,
    ratePct: Number,
    taxable: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    total: Number,
  },
  { _id: false }
);

const hsnSummarySchema = new mongoose.Schema(
  {
    isIGST: Boolean,
    rows: [hsnSummaryRowSchema],
  },
  { _id: false }
);

/* -------- Purchase Order schema -------- */
const PurchaseOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    partyId: { type: String },

    // Freight/extras already present
    coolieAndCartage: { type: Number },
    transportationCost: { type: Number },
    labourCost: { type: Number },
    localFreight: { type: Number },
    miscellaneousCost: { type: Number },
    tax: { type: Number }, // landed price tax on extras
    maxGstPercentage: { type: Number },

    database: { type: String },
    invoiceId: { type: String },
    date: { type: Date },
    poNumber: { type: String },
    DispatchDate: { type: String },
    partyEmail: { type: String }, // store if you capture it during create
    emailSentAt: { type: Date, default: null },

    fullName: { type: String },
    address: { type: String },
    MobileNo: { type: Number },

    country: { type: String },
    state: { type: String },
    city: { type: String },
    landMark: { type: String },
    pincode: { type: Number },

    grandTotal: { type: Number, default: 0 },

    discount: { type: Number, default: 0 }, // leave as-is (legacy)
    shippingCost: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },

    status: { type: String, default: "pending" },

    latitude: { type: String },
    longitude: { type: String },
    currentAddress: { type: String },

    paymentId: { type: String },
    paymentMode: { type: String },

    orderItems: [orderItemsSchema],

    // 🔁 amounts that must match the new Summary
    roundOff: { type: Number }, // rounded - raw
    amount: { type: Number }, // taxable after discounts & charges

    // 🔁 totals including GST on charges
    sgstTotal: { type: Number },
    cgstTotal: { type: Number },
    igstTotal: { type: Number },

    // legacy field (keep)
    discountAmount: { type: Number },

    // 🔁 was Number earlier — make it Boolean to match frontend
    igstTaxType: { type: Boolean },

    // 🔁 allow any shape from current GST calc (more future-proof)
    gstDetails: { type: [mongoose.Schema.Types.Mixed], default: [] },

    transporter: { type: Object },
    vehicleNo: { type: String },

    otherCharges: { type: Number },
    gstOtherCharges: { type: [mongoose.Schema.Types.Mixed], default: [] },

    ARN: { type: String },
    ARNStatus: { type: Boolean, default: false },
    invoiceStatus: { type: Boolean, default: false },

    NoOfPackage: { type: Number, default: 0 },
    BuiltyNumber: { type: String },

    // ✅ NEW: applied discounts/charges rows (persist what user chose)
    discountDetails: { type: [adjustmentRowSchema], default: [] },

    // ✅ NEW: GST on charges split
    ChargesCgst: { type: Number, default: 0 },
    ChargesSgst: { type: Number, default: 0 },
    ChargesIgst: { type: Number, default: 0 },

    // ✅ NEW: compact HSN summary (optional)
    hsnSummary: { type: hsnSummarySchema, default: null },
  },
  { timestamps: true }
);

export const PurchaseOrder = mongoose.model(
  "purchaseOrder",
  PurchaseOrderSchema
);
