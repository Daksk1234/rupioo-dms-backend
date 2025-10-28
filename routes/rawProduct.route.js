import express, { Router } from "express";
import {
  addRawProduct,
  DeleteProductionProductSection,
  DeleteRawProduct,
  saveProductionProductSection,
  UpdateProductionProductSection,
  UpdateRawProduct,
  updateRawProductStep,
  ViewProductionProductSection,
  ViewProductionProductSectionById,
  viewRawCurrentStock,
  ViewRawProduct,
  ViewRawProductById,
} from "../controller/rawProduct.controller.js";
const router = express.Router();

router.post("/save-rawProduct", addRawProduct);
router.get("/view-rawProduct/:database", ViewRawProduct);
router.get("/view-by-rawProduct/:id", ViewRawProductById);
router.delete("/delete-rawProduct/:id", DeleteRawProduct);
router.put("/update-rawProduct/:id", UpdateRawProduct);
router.get("/view-currentStock/:id/:productId", viewRawCurrentStock);
router.post("/update-rawProduct-step", updateRawProductStep);
router.post("/save-production-product-section", saveProductionProductSection);
router.put(
  "/update-production-product-section",
  UpdateProductionProductSection
);
router.delete(
  "/delete-production-product-section",
  DeleteProductionProductSection
);
router.get(
  "/view-production-product-section/:database",
  ViewProductionProductSection
);
router.get(
  "/view-production-product-section-by-id",
  ViewProductionProductSectionById
);
export default router;
