import { Document } from "mongoose";
import { IAdmin } from "../models/Admin";
import { IBranchManager } from "../models/BranchManager";

// Base interface for all authenticated users
export interface IBaseAuthUser {
  _id: string;
  role: "Super-Admin" | "Branch-Admin";
  createdAt: Date;
  updatedAt: Date;
}

// Admin user type
export interface IAdminUser extends IBaseAuthUser {
  role: "Super-Admin";
  name: string;
  email: string;
  isActive: boolean;
}

// Branch Manager user type
export interface IBranchManagerUser extends IBaseAuthUser {
  role: "Branch-Admin";
  applicationId: string;
  branch: any;
  password: string;
  createdBy: any;
}

// Union type for req.user - simplified
export type AuthenticatedUser =
  | (Document & IAdmin)
  | (Document & IBranchManager & { role: "Branch-Admin" });

// Type guard functions - simplified logic
export function isAdmin(user: AuthenticatedUser): user is Document & IAdmin {
  return "email" in user && "name" in user;
}

export function isBranchManager(
  user: AuthenticatedUser
): user is Document & IBranchManager & { role: "Branch-Admin" } {
  return "applicationId" in user;
}

// Helper function to get user role safely
export function getUserRole(
  user: AuthenticatedUser
): "Super-Admin" | "Branch-Admin" {
  if (isAdmin(user)) {
    return user.role === "Super-Admin" ? "Super-Admin" : "Branch-Admin";
  } else {
    return "Branch-Admin";
  }
}

// Helper function to get user branch safely
export function getUserBranch(user: AuthenticatedUser): any | null {
  if (isBranchManager(user)) {
    return user.branch;
  }
  return null; // Super-Admin doesn't have a specific branch
}

// Helper function to check if user can access branch data
export function canAccessBranch(
  user: AuthenticatedUser,
  branchId: string
): boolean {
  if (isAdmin(user)) {
    // Super-Admin can access all branches
    return true;
  } else if (isBranchManager(user)) {
    // Branch-Admin can only access their own branch
    return user.branch?.toString() === branchId;
  }
  return false;
}

// Extended Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
