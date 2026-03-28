import express from "express";

import {
  saveAuthData,
  loginCustomer,
} from "../../controllers/CustomerController/customer.controller";

import {
  checkPhoneNumber,
  checkPhoneNumbersBatch,
} from "../../controllers/CustomerController/phoneNoCheck.controller";
import {
  validateBatchPhoneCheck,
  validatePhoneCheck,
} from "../../middleware/phoneNoValidation";

const router = express.Router();

router.post("/save-auth-data", saveAuthData);

router.post("/check-phone", validatePhoneCheck, checkPhoneNumber);
router.post(
  "/check-phones-batch",
  validateBatchPhoneCheck,
  checkPhoneNumbersBatch
);

router.post("/login", loginCustomer);

// Add recovery System

export default router;
