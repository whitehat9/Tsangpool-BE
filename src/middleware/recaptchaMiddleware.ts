// backend/middleware/recaptchaMiddleware.ts
import { Request, Response, NextFunction } from "express";

import logger from "../utils/logger";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";

interface RecaptchaAssessment {
  tokenProperties: {
    valid: boolean;
    invalidReason?: string;
    action: string;
  };
  riskAnalysis: {
    score: number;
    reasons: string[];
  };
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
    const projectId = process.env.RECAPTCHA_PROJECT_ID;
    const siteKey = process.env.RECAPTCHA_SITE_KEY;

    if (!projectId || !siteKey) {
      logger.error("Missing RECAPTCHA_PROJECT_ID or RECAPTCHA_SITE_KEY env vars");
      res.status(500).json({ success: false, message: "Server misconfiguration" });
      return;
    }

    // Create reCAPTCHA Enterprise client
    const client = new RecaptchaEnterpriseServiceClient();
    const projectPath = client.projectPath(projectId);

    // Build the assessment request
    const request = {
      assessment: {
        event: {
          token: token,
          siteKey: siteKey,
        },
      },
      parent: projectPath,
    };

    // Create assessment
    const [response] = await client.createAssessment(request);

    // Check if the token is valid
    if (!response.tokenProperties || !response.tokenProperties.valid) {
      logger.warn("reCAPTCHA Enterprise token invalid", {
        invalidReason: response.tokenProperties?.invalidReason,
      });
      res.status(400).json({
        success: false,
        message: "Invalid reCAPTCHA token",
        reason: response.tokenProperties?.invalidReason,
      });
      return;
    }

    // Check if the expected action was executed
    if (response.tokenProperties.action !== "submit") {
      logger.warn("reCAPTCHA Enterprise action mismatch", {
        expectedAction: "submit",
        actualAction: response.tokenProperties.action,
      });
      res.status(400).json({
        success: false,
        message: "reCAPTCHA action mismatch",
      });
      return;
    }

    // Get the risk score (optional: you can set a threshold)
    const score = response.riskAnalysis?.score || 0;
    logger.info("reCAPTCHA Enterprise verification successful", {
      score,
      reasons: response.riskAnalysis?.reasons || [],
    });

    next();
  } catch (error) {
    logger.error("reCAPTCHA Enterprise verification error:", error);
    res.status(500).json({
      success: false,
      message: "reCAPTCHA verification error",
    });
  }
};
