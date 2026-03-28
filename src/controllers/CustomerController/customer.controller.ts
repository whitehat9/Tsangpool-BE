import asyncHandler from "express-async-handler";
import { Request, Response } from "express";

import logger from "../../utils/logger";
import { BaseCustomerModel } from "../../models/CustomerSystem/BaseCustomer";
import { CustomerProfileModel } from "../../models/CustomerSystem/CustomerProfile";
import admin from "firebase-admin";

/**
 * @desc    Save customer data after Firebase OTP verification
 * @route   POST /api/customer/save-auth-data
 * @access  Public
 */
export const saveAuthData = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { phoneNumber, firebaseUid } = req.body;

      if (!phoneNumber) {
        res.status(400);
        throw new Error("Phone number is required");
      }

      // Create or update base customer (only phone number and verification status)
      let customer = await BaseCustomerModel.findOne({ phoneNumber });

      if (customer) {
        // Update existing customer
        customer.isVerified = true;
        if (firebaseUid) {
          customer.firebaseUid = firebaseUid;
        }
        await customer.save();
      } else {
        // Create new customer
        customer = await BaseCustomerModel.create({
          phoneNumber,
          firebaseUid,
          isVerified: true,
        });
      }

      logger.info(`OTP verified for customer: ${phoneNumber}`);

      res.status(200).json({
        success: true,
        message: "OTP verification successful",
        data: {
          customer: {
            _id: customer._id,
            phoneNumber: customer.phoneNumber,
            isVerified: customer.isVerified,
            profileCompleted: false, // Profile not created yet
          },
        },
      });
    } catch (error) {
      console.warn("OTP verification error:", error);
      res.status(400);
      throw new Error("OTP verification failed");
    }
  }
);
/**
 * @desc    Customer login
 * @route   POST /api/customer/login
 * @access  Public
 */
export const loginCustomer = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400);
      throw new Error("ID token is required");
    }

    try {
      // Verify Firebase token
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      // Get phone number from verified token and normalize it
      let phoneNumber = decodedToken.phone_number;

      if (!phoneNumber) {
        res.status(400);
        throw new Error("Phone number not found in token");
      }

      // Normalize the phone number by removing the country code
      // If phone number starts with +91, remove it
      if (phoneNumber.startsWith("+91")) {
        phoneNumber = phoneNumber.substring(3); // Remove +91 prefix
      }

      // Find customer in your database with the normalized phone number
      const customer = await BaseCustomerModel.findOne({ phoneNumber });

      if (!customer) {
        res.status(404);
        throw new Error("Customer not found. Please register first.");
      }

      if (!customer.isVerified) {
        res.status(401);
        throw new Error("Customer account is not verified");
      }

      // Get profile
      const profile = await CustomerProfileModel.findOne({
        customer: customer._id,
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          customer: {
            _id: customer._id,
            phoneNumber: customer.phoneNumber,
            isVerified: customer.isVerified,
            profileCompleted: !!profile?.profileCompleted,
          },
          token: idToken,
        },
      });
    } catch (error: unknown) {
      console.error("Login error:", error);

      if (error instanceof Error) {
        // If the error is already set with a specific status, don't change it
        if (!res.statusCode || res.statusCode === 200) {
          res.status(401);
        }
        throw error;
      } else {
        res.status(500);
        throw new Error("An unexpected error occurred during login");
      }
    }
  }
);
