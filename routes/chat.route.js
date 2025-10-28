import express from "express"
import { saveChat, viewChat } from "../controller/chat.controller.js";
const router=express.Router();
router.post("/save-chat",saveChat)
router.get("/view-chat/:superadmin",viewChat)
export default router;