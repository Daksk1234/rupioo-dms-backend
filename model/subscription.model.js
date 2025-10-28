import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    subscriptionCost: { type: Number },
    days: { type: Number },
    planName: { type: String },
    noOfUser: { type: Number },
    subscriptionType: { type: String },
    annualMaintenanceCost: { type: Number },
    perUserCost: { type: Number },

    // ✅ New: multiple groups per plan
    // store references to your Group documents (model name we used earlier: "groupbundle")
    groups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "groupbundle",
      },
    ],

    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model("subscription", SubscriptionSchema);
