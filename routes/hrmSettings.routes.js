// File: routes/hrmSettings.routes.js
import express from "express";import{viewSettings,upsertSettings}from"../controller/hrmSettings.controller.js";export const hrmSettingsRouter=express.Router();hrmSettingsRouter.get("/view/:database",viewSettings);hrmSettingsRouter.post("/upsert/:database",upsertSettings);export default hrmSettingsRouter;
