import express from "express";
import {
  deleteAllBikeImages,
  deleteBikeImage,
  getBikeImages,
  setPrimaryImage,
  updateBikeImage,
  uploadBikeImages,
  uploadSingleBikeImage,
} from "../../controllers/BikeSystemController/bikeImage.controller";
import { authorize, protect } from "../../middleware/authmiddleware";
import { bikeUploadConfig, handleMulterError } from "../../config/multerConfig";

const router = express.Router();

// Public routes
router.get("/:bikeId", getBikeImages);

// Protected routes (Super-Admin only) - FILE UPLOADS HERE
router.post(
  "/:bikeId",
  protect,
  authorize("Super-Admin"),
  bikeUploadConfig.array("images", 10), // Max 10 images
  handleMulterError,
  uploadBikeImages
);

router.post(
  "/:bikeId/single",
  protect,
  authorize("Super-Admin"),
  bikeUploadConfig.single("image"),
  handleMulterError,
  uploadSingleBikeImage
);

// Image management routes
router.patch(
  "/image/:imageId",
  protect,
  authorize("Super-Admin"),
  updateBikeImage
);

router.delete(
  "/image/:imageId",
  protect,
  authorize("Super-Admin"),
  deleteBikeImage
);

router.delete(
  "/:bikeId",
  protect,
  authorize("Super-Admin"),
  deleteAllBikeImages
);

router.put(
  "/:bikeId/primary/:imageId",
  protect,
  authorize("Super-Admin"),
  setPrimaryImage
);

export default router;
