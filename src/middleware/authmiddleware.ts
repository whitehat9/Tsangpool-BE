// middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import asyncHandler from "express-async-handler";
import Admin from "../models/Admin";
import BranchManager from "../models/BranchManager";
import dotenv from "dotenv";
import ErrorResponse from "../utils/errorResponse";
import { verifyToken } from "../utils/jwt";
import { AuthenticatedUser, getUserRole } from "../types/user.types";

dotenv.config();

export const protect = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    let token;

    // Check if token exists in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      try {
        // Get token from header
        token = req.headers.authorization.split(" ")[1];

        // Verify token
        const decoded = verifyToken(token);

        let user: AuthenticatedUser | null = null;

        // First try to find as Admin
        const admin = await Admin.findById(decoded.id).select("-password");
        if (admin) {
          user = admin;
        } else {
          // Then try to find as BranchManager
          const branchManager = await BranchManager.findById(decoded.id)
            .select("-password")
            .populate("branch", "name address");

          if (branchManager) {
            // Add the role property for BranchManager
            const branchManagerWithRole = Object.assign(branchManager, {
              role: "Branch-Admin" as const,
            });
            user = branchManagerWithRole;
          }
        }

        if (!user) {
          res.status(401);
          throw new Error("User not found with this token");
        }

        req.user = user;
        next();
      } catch (error) {
        console.error("Token verification error:", error);
        res.status(401);
        throw new Error("Not authorized, token failed");
      }
    } else {
      res.status(401);
      throw new Error("Not authorized, no token");
    }
  }
);

// Grant access to specific roles
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ErrorResponse("User not found", 401));
    }

    const userRole = getUserRole(req.user);

    if (!roles.includes(userRole)) {
      return next(
        new ErrorResponse(
          `User role ${userRole} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};
