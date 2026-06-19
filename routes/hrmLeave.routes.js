// File: routes/hrmLeave.routes.js
import express from "express";
import{createLeave,listLeaves,updateLeave,deleteLeave}from"../controller/hrmLeave.controller.js";
export const hrmLeaveRouter=express.Router();
hrmLeaveRouter.post("/create/:database",createLeave);
hrmLeaveRouter.get("/list/:database",listLeaves);
hrmLeaveRouter.put("/update/:id/:database",updateLeave);
hrmLeaveRouter.delete("/delete/:id/:database",deleteLeave);
export default hrmLeaveRouter;
