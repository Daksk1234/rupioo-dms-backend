import mongoose from "mongoose";

const SupportCodeSchema = new mongoose.Schema(
  {
    database: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("SupportCode", SupportCodeSchema);
