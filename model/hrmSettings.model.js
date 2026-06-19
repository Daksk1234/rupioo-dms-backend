// File: model/hrmSettings.model.js
import mongoose from "mongoose";
const hrmSettingsSchema = new mongoose.Schema({
  database:{type:String,required:true,unique:true,index:true},
  attendanceSlogan:{type:String,default:"Smile please — attendance is just one face away."},
  geofenceEnabled:{type:Boolean,default:false},
  officeLatitude:{type:String,default:""},
  officeLongitude:{type:String,default:""},
  radiusMeters:{type:String,default:"150"},
  deviceBindingEnabled:{type:Boolean,default:false},
  allowedDeviceId:{type:String,default:""},
  livenessEnabled:{type:Boolean,default:false},
  requireBlink:{type:Boolean,default:false},
  requireHeadMove:{type:Boolean,default:false},
  faceQualityEnabled:{type:Boolean,default:true},
  minFaceScore:{type:String,default:"0.45"},
  status:{type:String,default:"Active"}
}, {timestamps:true});
export const HrmSettings = mongoose.models.hrmSettings || mongoose.model("hrmSettings", hrmSettingsSchema);
