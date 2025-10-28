import mongoose from "mongoose";

const TargetCreationSchema = new mongoose.Schema(
  {
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    database: {
      type: String,
    },
    userId: {
      type: String,
    },
    salesPersonId: {
      type: String,
    },
    partyId: {
      type: String,
    },
    status: {
      type: String,
      default: "Active",
    },
    products: [
      {
        productId: {
          type: String,
        },
        qtyAssign: {
          type: Number,
        },
        price: {
          type: Number,
        },
        totalPrice: {
          type: Number,
        },
        assignPercentage: [
          {
            month: {
              type: String,
            },
            percentage: {
              type: Number,
            },
          },
        ],
      },
    ],
    date: {
      type: String,
    },
    startDate: {
      type: String,
    },
    endDate: {
      type: String,
    },
    incrementPercent: {
      type: Number,
    },
    grandTotal: {
      type: Number,
    },
  },
  { timestamps: true }
);
export const TargetCreation = mongoose.model(
  "targetCreation",
  TargetCreationSchema
);
