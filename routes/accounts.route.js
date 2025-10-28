import express from "express"
import { deleteAccount, savedAccount, viewAccount } from "../controller/accounts.controller.js";
const router=express.Router();

router.post("/add-account",savedAccount)
router.get("/view-account/:database",viewAccount)
router.delete("/delete-account/:id/:innerId",deleteAccount)
export default router