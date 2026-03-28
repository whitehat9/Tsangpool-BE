// src/routes/contact.ts
import express from "express";

import {
  deleteMessage,
  getMessageById,
  getMessages,
  markAsRead,
  sendMessage,
} from "../controllers/contact.controller";
import { verifyRecaptchaV2 } from "../middleware/recaptchaMiddleware";
import { protect } from "../middleware/authmiddleware";
import { formLimiter } from "../middleware/phoneNoValidation";

const router = express.Router();

// Public routes
router.post(
  "/send",
  verifyRecaptchaV2,
  formLimiter, // Rate limit contact form submissions
  sendMessage
);

// Protected routes (Admin only)
router.get("/get", protect, getMessages);

router.get("/:id", protect, getMessageById);

router.patch("/:id/read", protect, markAsRead);

router.delete("/:id", protect, deleteMessage);

export default router;
