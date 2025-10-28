import mongoose from "mongoose";
const dynamicunitSchema=new mongoose.Schema({
database:{
    type:String
},
created_by:{
    type:String
},
Units:[{
    unitId:{
        type:String
    },
    unitName:{
        type:String
    }
}]
},{timestamps:true})
export const DynamicUnit=mongoose.model("dynamicunit",dynamicunitSchema)