// File: routes/hrmLoanAdvance.routes.js

import express from "express";
import {
  createLoanAdvance,
  listLoanAdvances,
  viewLoanAdvance,
  updateLoanAdvance,
  approveLoanAdvance,
  rejectLoanAdvance,
  holdLoanAdvance,
  deleteLoanAdvance,
  listEmployeeLedger,
  getSalaryDeductions,
  markSalaryDeduction,
  payLoanAdvance,
} from "../controller/hrmLoanAdvance.controller.js";

export const hrmLoanAdvanceRouter = express.Router();

hrmLoanAdvanceRouter.post("/create/:database", createLoanAdvance);
hrmLoanAdvanceRouter.get("/list/:database", listLoanAdvances);
hrmLoanAdvanceRouter.get("/view/:id/:database", viewLoanAdvance);
hrmLoanAdvanceRouter.put("/update/:id/:database", updateLoanAdvance);

hrmLoanAdvanceRouter.put("/approve/:id/:database", approveLoanAdvance);
hrmLoanAdvanceRouter.put("/reject/:id/:database", rejectLoanAdvance);
hrmLoanAdvanceRouter.put("/hold/:id/:database", holdLoanAdvance);
hrmLoanAdvanceRouter.put("/pay/:id/:database", payLoanAdvance);

hrmLoanAdvanceRouter.delete("/delete/:id/:database", deleteLoanAdvance);

hrmLoanAdvanceRouter.get("/ledger/:database", listEmployeeLedger);
hrmLoanAdvanceRouter.get("/salary-deductions/:database", getSalaryDeductions);
hrmLoanAdvanceRouter.put(
  "/salary-deduction/:id/:database",
  markSalaryDeduction,
);

export default hrmLoanAdvanceRouter;
