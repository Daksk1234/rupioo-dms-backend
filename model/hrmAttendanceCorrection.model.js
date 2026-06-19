// File: model/hrmAttendanceCorrection.model.js
import mongoose from "mongoose";
const schema = new mongoose.Schema({ database:{type:String,required:true,index:true}, attendanceId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true}, oldInTime:String, oldOutTime:String, newInTime:String, newOutTime:String, reason:{type:String,required:true}, correctedBy:{type:mongoose.Schema.Types.ObjectId,default:null}, status:{type:String,default:"Active"} }, {timestamps:true});
export const HrmAttendanceCorrection = mongoose.models.hrmAttendanceCorrection || mongoose.model("hrmAttendanceCorrection", schema);
