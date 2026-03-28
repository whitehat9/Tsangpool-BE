import express from "express";

import {
  getScanFleetProfile,
  activateScanFleetToken,
} from "../../controllers/Scanfleet/scanfleet.controller";
import { protectCustomer } from "../../middleware/customerMiddleware";

const router = express.Router();

router.get("/profile", protectCustomer, getScanFleetProfile);
router.post("/activate", protectCustomer, activateScanFleetToken);

export default router;
