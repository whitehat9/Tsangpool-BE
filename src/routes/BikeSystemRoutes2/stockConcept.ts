import express from "express";
import { authorize, protect } from "../../middleware/authmiddleware";
import {
  createStockItem,
  getAllStockItems,
  getMyVehicles,
  getStockItemById,
  getVehicleById,
} from "../../controllers/VASnStock/stockConcept.controller";
import { activateToCustomer } from "../../controllers/VASnStock/AssignToCustomer/StockAssign";
import {
  protectAdminOrCustomer,
  protectCustomer,
} from "../../middleware/customerMiddleware";

const router = express.Router();

router.get("/my-vehicles", protectCustomer, getMyVehicles); // Customer-Dashboard
router.get("/:id", protectAdminOrCustomer, getVehicleById); // Customer-Dashboard
// Create new stock item
router.post(
  "/",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  createStockItem,
);

// Get all stock items with filtering
router.get(
  "/",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getAllStockItems,
);

// Assign stock item to customer
router.post(
  "/:id/activate",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  activateToCustomer,
);

// Get stock item by ID
router.get(
  "/:id",
  protect,
  authorize("Super-Admin", "Branch-Admin"),
  getStockItemById,
);

export default router;
