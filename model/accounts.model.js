import mongoose from "mongoose";
const accountSchema = new mongoose.Schema({
    created_by: {
        type: String
    },
    database: {
        type: String
    },
    Accounts: [{
        groupName: {
            type: String
        },
        ledgerName: {
            type: String
        },
        side: {
            type: String
        },
        accountType:{
            type:Array
        }
    }]
}, { timestamps: true })
export const Account = mongoose.model("account", accountSchema)