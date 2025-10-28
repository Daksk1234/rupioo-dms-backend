import express from "express";
import path from "path";
import {
  DeleteCategory,
  DeleteProductSection,
  UpdateCategory,
  UpdateProductSection,
  ViewCategory,
  ViewCategoryById,
  ViewProductSection,
  ViewProductSectionById,
  deleteStep,
  deleteSubCategory,
  saveCategory,
  saveProductSection,
  saveSteps,
  saveSubCategory,
  updateSteps,
  updateSubCategory,
} from "../controller/category.controller.js";
import multer from "multer";

const router = express.Router();

// const upload = multer({ dest: "public/Images/" });
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/Images/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + fileExtension);
  },
});
const upload = multer({ storage: storage });

router.post("/save-category", upload.single("file"), saveCategory);
router.get("/view-category/:id/:database", ViewCategory);
router.get("/view-category-by-id/:id", ViewCategoryById);
router.get("/delete-category/:id", DeleteCategory);
router.put("/update-category/:id", upload.single("file"), UpdateCategory);

router.post("/save-product-section", saveProductSection);
router.get("/view-product-section/:id/:database", ViewProductSection);
router.get("/view-product-section-by-id/:id", ViewProductSectionById);
router.get("/delete-product-section/:id", DeleteProductSection);
router.put("/update-product-section/:id", UpdateProductSection);

router.post("/save-subcategory", upload.single("file"), saveSubCategory);
router.put(
  "/update-categories/:categoryId/subcategories/:subcategoryId",
  upload.single("file"),
  updateSubCategory
);
router.delete(
  "/delete-categories/:categoryId/subcategories/:subcategoryId",
  deleteSubCategory
);

router.post("/save-step", saveSteps);
router.put("/update-step/:categoryId/:stepId", updateSteps);
router.delete("/delete-step/:categoryId/:stepId", deleteStep);
export default router;
