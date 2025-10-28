import mongoose from "mongoose";
const pincodeSchema = new mongoose.Schema({
    state: {
        type: String
    },
    district: {
        type: String
    },
    city: {
        type: String
    },
    pincode: {
        type: String
    },
}, { timestamps: true })
export const Pincode = mongoose.model('pincode', pincodeSchema)