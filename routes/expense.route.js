// File: routes/expense.routes.js

import express from "express";
import {
  approveExpense,
  createExpenseRequest,
  deleteExpense,
  getExpenses,
  getRequestedExpenses,
  payExpense,
  rejectExpense,
  resubmitExpense,
  updateExpense,
} from "../controller/expense.controller.js";

const router = express.Router();

router.post("/request/:db", createExpenseRequest);

router.get("/requested/:db", getRequestedExpenses);
router.get("/:db", getExpenses);

router.patch("/:id/:db/approve", approveExpense);
router.patch("/:id/:db/reject", rejectExpense);
router.patch("/:id/:db/resubmit", resubmitExpense);
router.patch("/:id/:db/pay", payExpense);

router.put("/:id/:db", updateExpense);
router.delete("/:id/:db", deleteExpense);

export default router;
