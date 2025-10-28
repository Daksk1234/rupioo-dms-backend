import mongoose from "mongoose"
const visitPointSchema = new mongoose.Schema({
    database: {
        type: String
    },
    userId: {
        type: String
    },
    date: {
        type: String
    },
    time: {
        type: String
    },
    checkIn: {
        type: String
    },
    checkOut: {
        type: String
    },
    checkInLatLog:{
        type:String
    },
    checkOutLatLog:{
        type:String
    }
}, { timestamps: true })
export const VisitPoint = mongoose.model("visitpoint", visitPointSchema)