import mongoose from "mongoose";

const StockUpdationSchema = new mongoose.Schema(
  {
    created_by: String,
    database: String,
    warehouseToId: String,
    warehouseFromId: String,
    stockTransferDate: String,
    exportId: String,

    // NEW
    fromSectionId: { type: String, default: "" },
    toSectionId: { type: String, default: "" },

    productItems: [
      {
        productId: String, // source
        destinationProductId: String, // NEW: destination (can equal productId)
        unitType: String,
        primaryUnit: String,
        secondaryUnit: String,
        secondarySize: String,
        Size: Number,
        currentStock: Number,
        transferQty: Number,
        price: Number,
        totalPrice: Number,
        sgstRate: Number,
        cgstRate: Number,
        isgtRate: Number,
        taxableAmount: Number,
        grandTotal: Number,
        gstPercentage: String,
        igstTaxType: Boolean,
        pendingStock: { type: Number, default: 0 },
        damageItem: Object,
      },
    ],
    grandTotal: Number,
    transferStatus: String,
    InwardStatus: String,
    OutwardStatus: String,
    warehouseNo: String,
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export const StockUpdation = mongoose.model(
  "stockUpdation",
  StockUpdationSchema
);
