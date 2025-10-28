import express from "express"
import { createProduction, deleteNestedProduct, deleteProduct, NestedUpdateProduct, productTarget, updateProduct, viewByIdProduct, viewProduct } from "../controller/startProduction.controller.js"

const router=express.Router()
router.post("/save-production",createProduction)
router.get("/view-productionList/:database",viewProduct)
router.get("/view-startProduction-by-id/:id",viewByIdProduct)
router.put("/update-startProduction/:id",updateProduct)
router.delete("/delete-StartProduction/:id", deleteProduct);
router.delete("/delete-nested-data/:id/:innerId", deleteNestedProduct);
router.put("/nested-update-production/:id/:innerId", NestedUpdateProduct);
router.get("/current-target-product/:id", productTarget);
export default router