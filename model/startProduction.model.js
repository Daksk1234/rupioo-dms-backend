import mongoose from "mongoose";

const productionSchema = new mongoose.Schema(
  {
    step_name: {
      type: String,
    },
    processName: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    database: {
      type: String,
    },
    product_details: [
      {
        user_name: {
          type: String,
        },
        rProduct_name: {
          type: String,
        },
        rProduct_name_Units: [],
        finalProductDetails: [
          {
            fProduct_name: {
              type: String,
            },
            fProduct_name_Units: [],
          },
        ],
        wastageProductDetails: [
          {
            wProduct_name: {
              type: String,
            },
            wProduct_name_Units: [],
          },
        ],
        status: {
          default: "Pending",
          type: String,
        },
      },
    ],
    totalStep: {
      type: Number,
    },
    step_No: {
      type: Number,
    },
    currentStep: {
      type: String,
    },
  },
  { timestamps: true }
);

export const StartProduction = mongoose.model(
  "startProduction",
  productionSchema
);
