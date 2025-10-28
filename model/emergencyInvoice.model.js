import mongoose from "mongoose";
const EmergencyInvoiceSchema = new mongoose.Schema({
    partyId: {
        type: String
    },
    count: {
        type: Number,
        default: 0
    },
    database: {
        type: String,
    },
    remark: {
        type: String
    },
    status: {
        type: String,
        default: "Pending"
    }
}, { timestamps: true })
export const EmergencyInvoice = mongoose.model("emergencyInvoice", EmergencyInvoiceSchema)