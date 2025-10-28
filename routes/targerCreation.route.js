import express from "express";
import multer from "multer";
import {
  Achievement,
  AllSalesPersonAchievement,
  DeleteTargetCreation,
  FYSummary,
  MonthMatrics,
  SavePartyTarget,
  SaveTargetCreation,
  UpdateTargetCreation,
  ViewPartyTarget,
  ViewTargetCreation,
  ViewTargetCreationById,
  called,
  checkTarget,
  deleteProductFromTargetCreation,
  increasePercentage,
  latestAchievement,
  latestAchievementById,
  latestAchievementSalesById,
  targetCalculation,
  updateTargetProducts,
  viewTarget,
  BuildSalesTargetsFromCustomers,
  fySummaryForSalesperson,
  monthMetricsForSalesperson,
  productBreakdownForSalesperson,
} from "../controller/targetCreation.controller.js";
const uploads = multer({ dest: "public/ExcelFile/" });
const router = express.Router();

router.post(
  "/save-target-creation",
  uploads.single("file"),
  SaveTargetCreation
);
// router.post("/save-target-creation", SaveTargetCreation);
router.get("/view-target-creation/:id/:database", ViewTargetCreation);
router.delete("/delete-target-creation/:id", DeleteTargetCreation);
router.put("/update-target-creation/:id", UpdateTargetCreation);
router.get("/view-target-creation-by-id/:id", ViewTargetCreationById);
router.delete("/:targetId/product/:productId", deleteProductFromTargetCreation);

router.get("/target-achieve/:id/:database", Achievement);
router.put("/update-productItems/:id", updateTargetProducts);

router.get("/increase-target", increasePercentage);
router.get("/view-target/:id", viewTarget);

router.post("/target-achievement/:database", latestAchievement);
router.post("/target-achievement-party/:id/:database", latestAchievementById);
router.post(
  "/target-achievement-sales-person/:id/:database",
  latestAchievementSalesById
);
router.post("/achievements/:id/:database", called);
// router.post("/test", yes)
router.post("/check/:id/:database", checkTarget);

// router.post("/customer-target", SavePartyTarget)
router.post("/customer-target", uploads.single("file"), SavePartyTarget);
router.get("/view-customer-target/:database", ViewPartyTarget);

router.get("/target-calculate/:database/:id", targetCalculation);
router.get("/all-salesperson-achievement/:database", AllSalesPersonAchievement);
router.get("/fy-summary", FYSummary);
router.get("/month-metrics", MonthMatrics);
router.post("/targets/build-from-customers", BuildSalesTargetsFromCustomers);
router.post("/targets/salesperson/fy-summary", fySummaryForSalesperson);
router.post("/targets/salesperson/month-metrics", monthMetricsForSalesperson);
router.post(
  "/targets/salesperson/product-breakdown",
  productBreakdownForSalesperson
);
export default router;
