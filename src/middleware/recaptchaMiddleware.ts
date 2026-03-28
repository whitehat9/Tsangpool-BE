// backend/middleware/recaptchaMiddleware.ts
import { Request, Response, NextFunction } from "express";

import logger from "../utils/logger";
import axios from "axios";

interface RecaptchaResponse {
  success: boolean;
  "error-codes"?: string[];
}

export const verifyRecaptchaV2 = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.body.recaptchaToken;
  // Bypass in development
  if (process.env.NODE_ENV === "development" || token === "dev-bypass") {
    logger.info("reCAPTCHA bypassed in development mode");
    next();
    return;
  }

  if (!token) {
    res.status(400).json({
      success: false,
      message: "reCAPTCHA token is required",
    });
    return;
  }

  try {
    const response = await axios.post<RecaptchaResponse>(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY_V2,
          response: token,
        },
      },
    );

    if (!response.data.success) {
      logger.warn("reCAPTCHA verification failed", {
        errors: response.data["error-codes"],
      });
      res.status(400).json({
        success: false,
        message: "reCAPTCHA verification failed",
        errors: response.data["error-codes"],
      });
      return;
    }

    next();
  } catch (error) {
    logger.error("reCAPTCHA verification error:", error);
    res.status(500).json({
      success: false,
      message: "reCAPTCHA verification error",
    });
  }
};
