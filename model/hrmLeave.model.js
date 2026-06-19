// File: model/hrmLeave.model.js
import mongoose from "mongoose";
const hrmLeaveSchema = new mongoose.Schema({ database:{type:String,required:true,index:true}, userId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true}, nameSnapshot:{type:String,default:""}, panNumber:{type:String,default:""}, type:{type:String,enum:["Leave","Short Leave","Permission","WFH","Half Day Leave"],default:"Leave"}, fromDate:{type:String,default:""}, toDate:{type:String,default:""}, reason:{type:String,default:""}, status:{type:String,enum:["Pending","Approved","Rejected","Deleted"],default:"Approved"} }, {timestamps:true});
export const HrmLeave = mongoose.models.hrmLeave || mongoose.model("hrmLeave", hrmLeaveSchema);
