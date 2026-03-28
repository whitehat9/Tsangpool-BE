// routes/BikeSystemModel2/csvStock.ts

import express from "express";
import { protect, authorize } from "../../middleware/authmiddleware";

import { csvUploadConfig, handleMulterError } from "../../config/multerConfig";
import {
  assignCSVStockToCustomer,
  deleteCSVStock,
  getCSVBatches,
  getCSVStockByStockId,
  getCSVStocks,
  getStocksByBatch,
  importCSVStock,
  unassignCSVStock,
  updateCSVStockStatus,
} from "../../controllers/BikeSystemController3/csvStockImport.controller";

const router = express.Router();

router.post(
  "/import",
  protect,
  authorize("Super-Admin"),
  csvUploadConfig.single("file"),
  handleMulterError,
  importCSVStock
);

router.get(
  "/",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getCSVStocks
);
//

router.post(
  "/assign/:stockId",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  assignCSVStockToCustomer
);
//
router.get(
  "/:stockId",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getCSVStockByStockId
);

// Get CSV import batches
router.get(
  "/batches/list",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getCSVBatches
);

// Get stocks by batch ID
router.get(
  "/batch/:batchId",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getStocksByBatch
);

// Update CSV stock status
router.patch(
  "/:stockId/status",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  updateCSVStockStatus
);
router.post(
  "/unassign/:stockId",
  protect,
  authorize("Super-Admin"),
  unassignCSVStock
);

// Delete CSV stock (soft delete)
router.delete("/:stockId", protect, authorize("Super-Admin"), deleteCSVStock);

export default router;
