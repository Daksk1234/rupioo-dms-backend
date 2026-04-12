import express from "express";
import {
  achievedTarget,
  deleteCompanyTarget,
  getCompanyTarget,
  getSalesManagerTarget,
  saveCompanyTarget,
  updateCompanyTarget,
  updateCustomerTarget,
  updateSalespersonTarget,
} from "../controller/companyTarget.controller.js";

const router = express.Router();
router.put("/salesperson-target", updateSalespersonTarget);

router.post("/save-company-target", saveCompanyTarget);
router.get("/get-company-target/:fyear/:database", getCompanyTarget);
router.get(
  "/get-salesmanager-target/:fyear/:salesManagerId",
  getSalesManagerTarget,
);
router.delete("/delete-comapany-target", deleteCompanyTarget);
router.put("/update-target", updateCompanyTarget);
router.put("/customer-target", updateCustomerTarget);
router.get("/view-achieve-target/:database/:fyear", achievedTarget);

export default router;
