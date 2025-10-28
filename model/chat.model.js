import mongoose from "mongoose";
const chatSchema=new mongoose.Schema({
    superadmin: {
        type: String,
      },
      messages: {
        type: Array,
      }
},{timestamps:true})
export const Chat=mongoose.model("chat",chatSchema)