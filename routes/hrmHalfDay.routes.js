// File: routes/hrmHalfDay.routes.js
import express from "express";
import{createHalfDay,listHalfDays,updateHalfDay,deleteHalfDay}from"../controller/hrmHalfDay.controller.js";
export const hrmHalfDayRouter=express.Router();
hrmHalfDayRouter.post("/create/:database",createHalfDay);
hrmHalfDayRouter.get("/list/:database",listHalfDays);
hrmHalfDayRouter.put("/update/:id/:database",updateHalfDay);
hrmHalfDayRouter.delete("/delete/:id/:database",deleteHalfDay);
export default hrmHalfDayRouter;
