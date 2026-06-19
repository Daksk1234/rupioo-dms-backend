// File: model/hrmHoliday.model.js
import mongoose from "mongoose";
const hrmHolidaySchema = new mongoose.Schema({
  database:{type:String,required:true,index:true,trim:true},
  date:{type:String,required:true,index:true},
  title:{type:String,default:"Holiday"},
  type:{type:String,default:"Holiday"},
  status:{type:String,enum:["Active","Deleted"],default:"Active",index:true},
},{timestamps:true});
hrmHolidaySchema.index({database:1,date:1,status:1});
export const HrmHoliday = mongoose.models.hrmHoliday || mongoose.model("hrmHoliday", hrmHolidaySchema);
