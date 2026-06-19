// File: controller/hrmEmployee.controller.js
import mongoose from "mongoose";
import { HrmEmployee } from "../model/hrmEmployee.model.js";
import { cleanDatabase, fail, success } from "./_hrmCommon.js";
const isId=(v)=>mongoose.Types.ObjectId.isValid(String(v||""));
const payload=(body,database)=>({
  database,
  userId:isId(body.userId)?new mongoose.Types.ObjectId(body.userId):null,
  employeeName:body.employeeName||body.name||"",
  panNumber:body.panNumber?String(body.panNumber).toUpperCase():"",
  mobileNumber:body.mobileNumber||"",
  salaryAmount:Number(body.salaryAmount||body.salary||0),
  department:body.department||"",
  designation:body.designation||"",
  status:body.status||"Active",
});
export const createEmployee=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const data=payload(req.body,database);if(!data.employeeName)return fail(res,400,"Employee name is required.");const row=await HrmEmployee.create(data);return success(res,"Employee saved successfully.",row)}catch(e){return fail(res,500,"Unable to save employee.",e)}};
export const listEmployees=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const rows=await HrmEmployee.find({database,status:{$ne:"Deleted"}}).sort({employeeName:1}).lean();return success(res,"Employee list fetched successfully.",rows)}catch(e){return fail(res,500,"Unable to fetch employees.",e)}};
export const getEmployeeById=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const row=await HrmEmployee.findOne({_id:req.params.id,database,status:{$ne:"Deleted"}}).lean();if(!row)return fail(res,404,"Employee not found.");return success(res,"Employee fetched successfully.",row)}catch(e){return fail(res,500,"Unable to fetch employee.",e)}};
export const updateEmployee=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const row=await HrmEmployee.findOneAndUpdate({_id:req.params.id,database,status:{$ne:"Deleted"}},{$set:payload(req.body,database)},{new:true});if(!row)return fail(res,404,"Employee not found.");return success(res,"Employee updated successfully.",row)}catch(e){return fail(res,500,"Unable to update employee.",e)}};
export const deleteEmployee=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const row=await HrmEmployee.findOneAndUpdate({_id:req.params.id,database},{$set:{status:"Deleted"}},{new:true});if(!row)return fail(res,404,"Employee not found.");return success(res,"Employee deleted successfully.",row)}catch(e){return fail(res,500,"Unable to delete employee.",e)}};
