// File: model/hrmEmployee.model.js
import mongoose from "mongoose";
const hrmEmployeeSchema = new mongoose.Schema({
  database:{type:String,required:true,index:true,trim:true},
  userId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true},
  employeeName:{type:String,required:true,trim:true},
  panNumber:{type:String,default:"",trim:true,uppercase:true,index:true},
  mobileNumber:{type:String,default:""},
  salaryAmount:{type:Number,default:0},
  department:{type:String,default:""},
  designation:{type:String,default:""},
  status:{type:String,enum:["Active","Inactive","Deleted"],default:"Active",index:true},
},{timestamps:true});
hrmEmployeeSchema.index({database:1,panNumber:1,status:1});
export const HrmEmployee = mongoose.models.hrmEmployee || mongoose.model("hrmEmployee", hrmEmployeeSchema);
