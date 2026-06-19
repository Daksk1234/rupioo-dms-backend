// File: model/hrmShift.model.js
import mongoose from "mongoose";
const daySchema = new mongoose.Schema({day:String,dayNo:Number,isWorking:{type:Boolean,default:true},inTime:{type:String,default:"09:30"},outTime:{type:String,default:"18:30"}}, {_id:false});
const hrmShiftSchema = new mongoose.Schema({ database:{type:String,required:true,index:true}, shiftName:{type:String,required:true}, shiftCode:{type:String,default:""}, description:{type:String,default:""}, graceInMinutes:{type:Number,default:0}, graceOutMinutes:{type:Number,default:0}, lastMinuteAttendance:{type:String,default:"11:00"}, days:{type:[daySchema],default:[]}, status:{type:String,enum:["Active","Inactive","Deleted"],default:"Active",index:true} }, {timestamps:true});
hrmShiftSchema.index({database:1,shiftName:1,status:1},{name:"hrm_shift_database_name_idx"});
export const HrmShift = mongoose.models.hrmShift || mongoose.model("hrmShift", hrmShiftSchema);
