import express from "express";
import {
  loginSuperAdmin,
  logoutSuperAdmin,
  createBranchM,
  deleteBranchM,
  getAllBranchManagers,
} from "../controllers/auth.controller";
import seedAdmin from "../AdminPrivilege/seeder";
import { authorize, protect } from "../middleware/authmiddleware";

import { loginBranchM, logoutBranchM } from "../controllers/branchM.controller";

const router = express.Router();

// Seed route (development only)
if (process.env.NODE_ENV === "development") {
  router.post("/seed", seedAdmin);
}

// ===== LOGIN ROUTES (PUBLIC - No auth needed) =====
router.post("/super-ad-login", loginSuperAdmin);
router.post("/branchM-login", loginBranchM);

// ===== LOGOUT ROUTES (PROTECTED) =====
router.post(
  "/super-ad-logout",
  protect,
  authorize("Super-Admin"),
  logoutSuperAdmin
);

router.post(
  "/branchM-logout",
  protect,
  authorize("Branch-Admin"),
  logoutBranchM
);

// ===== BRANCH MANAGER MANAGEMENT (Super-Admin only) =====
router.post(
  "/create-branchM",
  protect,
  authorize("Super-Admin"),
  createBranchM
);

router.get(
  "/branch-managers",
  protect,
  authorize("Super-Admin"),
  getAllBranchManagers
);

router.delete(
  "/del-branchM/:id",
  protect,
  authorize("Super-Admin"),
  deleteBranchM
);

export default router;
