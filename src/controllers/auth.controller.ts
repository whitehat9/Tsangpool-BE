// auth.controller.ts
import asyncHandler from "express-async-handler";
import { Request, Response, NextFunction } from "express";
import Admin from "../models/Admin";
import logger from "../utils/logger";
import dotenv from "dotenv";
import BranchManager from "../models/BranchManager";
import Branch from "../models/Branch";
import mongoose from "mongoose";
import {
  generateApplicationId,
  generateRandomPassword,
} from "../utils/generateID";
import {
  isAdmin,
  isBranchManager,
  getUserRole,
  getUserBranch,
} from "../types/user.types";

dotenv.config();

/**
 * @desc    Login Super-Admin and generate token
 * @route   POST /api/adminLogin/super-ad-login
 * @access  Public
 */
export const loginSuperAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Please provide both email and password",
      });
      return;
    }

    // Find admin by email
    const admin = await Admin.findOne({ email }).select("+password");

    // Check if admin exists and password matches
    if (!admin || !(await admin.matchPassword(password))) {
      logger.info(`Failed login attempt for email: ${email}`);
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    // Generate token
    const token = admin.getSignedJwtToken();

    // Log successful login
    logger.info(`Admin logged in: ${admin.email}`);

    // Return success with token
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        token,
      },
    });
  },
);

/**
 * @desc    Logout Super-Admin
 * @route   POST /api/adminLogin/super-ad-logout
 * @access  Private
 */
export const logoutSuperAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user from req (set by protect middleware)
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: "No user found, already logged out",
        });
        return;
      }

      // Log the logout action
      logger.info(`Admin logged out: ${user.email || user.id}`);

      // Set secure headers to clear any cookies if you're using them
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      res.status(200).json({
        success: true,
        message: "Logout successful",
        data: {
          loggedOutAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Logout error:", error);
      res.status(500).json({
        success: false,
        message: "Error during logout",
      });
    }
  },
);

/**
 * @desc    Create Branch Manager
 * @route   POST /api/adminLogin/create-branchM
 * @access  Private (Super-Admin only)
 */
export const createBranchM = asyncHandler(
  async (req: Request, res: Response) => {
    const { branch } = req.body;

    // Validate required fields
    if (!branch) {
      res.status(400);
      throw new Error("Please provide branch ID");
    }

    // Validate branch exists
    if (!mongoose.Types.ObjectId.isValid(branch)) {
      res.status(400);
      throw new Error("Invalid branch ID");
    }

    const branchExists = await Branch.findById(branch);
    if (!branchExists) {
      res.status(404);
      throw new Error(
        "Branch not found. Please create a branch first before creating a branch manager.",
      );
    }

    // Generate application ID and password
    const applicationId = generateApplicationId();
    const password = generateRandomPassword();

    // Ensure req.user exists and is admin
    if (!req.user || !isAdmin(req.user)) {
      res.status(403);
      throw new Error("Only Super-Admin can create branch managers");
    }

    // Create branch manager
    const branchManager = await BranchManager.create({
      applicationId,
      password,
      branch,
      createdBy: req.user._id,
    });

    // Log creation
    logger.info(
      `Branch manager created for branch: ${branchExists.branchName}`,
    );

    // Return success response with credentials
    res.status(201).json({
      success: true,
      message: "Branch manager created successfully",
      data: {
        applicationId: branchManager.applicationId,
        password: password, // Only returned once at creation
        branch: branchExists.branchName,
      },
    });
  },
);

/**
 * @desc    Delete Branch Manager
 * @route   DELETE /api/adminLogin/del-branchM/:id
 * @access  Private (Super-Admin only)
 */
export const deleteBranchM = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid branch manager ID");
    }

    const branchManager = await BranchManager.findById(id);

    if (!branchManager) {
      res.status(404);
      throw new Error("Branch manager not found");
    }

    // Get branch details for logging
    const branch = await Branch.findById(branchManager.branch);

    // Delete the branch manager
    await BranchManager.findByIdAndDelete(id);

    logger.info(
      `Branch manager deleted from branch: ${branch?.branchName || "Unknown"}`,
    );

    res.status(200).json({
      success: true,
      message: "Branch manager deleted successfully",
    });
  },
);

/**
 * @desc    Get all branch managers
 * @route   GET /api/adminLogin/branch-managers
 * @access  Private (Super-Admin only)
 */
export const getAllBranchManagers = asyncHandler(
  async (req: Request, res: Response) => {
    const branchManagers = await BranchManager.find()
      .populate("branch", "name address")
      .populate("createdBy", "name email");

    res.status(200).json({
      success: true,
      count: branchManagers.length,
      data: branchManagers,
    });
  },
);
