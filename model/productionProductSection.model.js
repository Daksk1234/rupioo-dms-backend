import mongoose from "mongoose";

const productionProductSectionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    database: {
      type: String,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      default: "Active",
    },
  },
  { timestamps: true }
);

export const ProductionProductSection = mongoose.model(
  "productionProductSection",
  productionProductSectionSchema
);
