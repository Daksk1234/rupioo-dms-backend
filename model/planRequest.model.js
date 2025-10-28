import mongoose from "mongoose";
const planSchema=new mongoose.Schema({
    paymentImg:{
        type:String
    },
    plan:{
        type:String
    },
    PrevPlan:{
    type:String
    },
    amount:{
        type:Number
    },
    superAdmin:{
        type:String
    },
    message:{
     type:String
    },
    status:{
        default:"Pending",
        type:String
    }
},{timestamps:true})
export const PlanRequest=mongoose.model("planRequest",planSchema)