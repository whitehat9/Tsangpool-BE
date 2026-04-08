// routes/BikeSystemRoutes2/bikeManagement.ts
import express from "express";
import { protect, authorize } from "../../middleware/authmiddleware";
import {
  getAvailableBikes,
  getBikeById,
  assignBikeToCustomer,
  unassignBikeFromCustomer,
  getBikeAssignments,
  updateBikeStock,
} from "../../controllers/BikeSystemController2/bikeManagement.controller";

const router = express.Router();

// Get available bikes for assignment
router.get("/available", protect, authorize("Super-Admin", "Admin"), getAvailableBikes);

// Get bike by ID
router.get("/:id", protect, authorize("Super-Admin", "Admin"), getBikeById);

// Assign bike to customer
router.post("/:id/assign", protect, authorize("Super-Admin", "Admin"), assignBikeToCustomer);

// Remove bike assignment
router.delete("/:id/unassign", protect, authorize("Super-Admin", "Admin"), unassignBikeFromCustomer);

// Get bike assignment history
router.get("/:id/assignments", protect, authorize("Super-Admin", "Admin"), getBikeAssignments);

// Update bike stock
router.patch("/:id/stock", protect, authorize("Super-Admin", "Admin"), updateBikeStock);

export default router;
