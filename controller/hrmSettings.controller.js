// File: controller/hrmSettings.controller.js
import { HrmSettings } from "../model/hrmSettings.model.js";import { cleanDatabase, fail, success } from "./_hrmCommon.js";
export const viewSettings=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const row=await HrmSettings.findOne({database}).lean();return success(res,"Settings fetched successfully.",row)}catch(e){return fail(res,500,"Unable to fetch settings.",e)}};
export const upsertSettings=async(req,res)=>{try{const database=cleanDatabase(req.params.database);const payload={...req.body,database};const row=await HrmSettings.findOneAndUpdate({database},{$set:payload},{new:true,upsert:true});return success(res,"Settings saved successfully.",row)}catch(e){return fail(res,500,"Unable to save settings.",e)}};
