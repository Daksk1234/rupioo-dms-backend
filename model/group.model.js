import mongoose from "mongoose";

const PermissionSchema = new mongoose.Schema(
  {
    pagename: { type: String, required: true }, // e.g. "Warehouse", "Users"
    permission: [{ type: String }], // e.g. ["View","Create","Edit","Delete","Download","BulkUpload"]
  },
  { _id: false }
);

const GroupSchema = new mongoose.Schema(
  {
    groupName: { type: String, required: true, trim: true, unique: true },
    groupDesc: { type: String, default: "" },
    permissions: { type: [PermissionSchema], default: [] },
    status: { type: String, default: "Active", enum: ["Active", "Deactive"] },
  },
  { timestamps: true }
);

export const GroupBundle = mongoose.model("groupbundle", GroupSchema);
