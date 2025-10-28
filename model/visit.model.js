import mongoose from "mongoose"
const visitSchema = new mongoose.Schema({
    created_by: {
        type: String
    },
    customerName: {
        type: String
    },
    date: {
        type: String
    },
    time: {
        type: String
    },
    latitude: {
        type: String
    },
    longitude: {
        type: String
    },
    database: {
        type: String
    },
    status: {
        type: String,
        default: "Active"
    }
}, { timestamps: true })
export const Visit = mongoose.model("visit", visitSchema)