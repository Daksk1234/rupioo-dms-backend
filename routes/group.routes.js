import express from "express";
import {
  SaveGroup,
  ViewGroups,
  ViewGroupById,
  DeleteGroup,
  UpdateGroup,
} from "../controller/group.controller.js";

const router = express.Router();

router.post("/save", SaveGroup);
router.get("/list", ViewGroups);
router.get("/by-id/:id", ViewGroupById);
router.delete("/delete/:id", DeleteGroup);
router.put("/update/:id", UpdateGroup);

export default router;
