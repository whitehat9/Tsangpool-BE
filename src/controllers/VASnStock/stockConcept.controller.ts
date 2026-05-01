import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { StockConceptModel } from "../../models/BikeSystemModel2/StockConcept";
import logger from "../../utils/logger";
import { StockConceptCSVModel } from "../../models/BikeSystemModel3/StockConceptCSV";

/**
 * @desc    Create new stock item
 * @route   POST /api/stock-concept
 * @access  Private (Super-Admin, Branch-Admin)
 */
export const createStockItem = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      modelName,
      category,
      engineCC,

      engineNumber,
      chassisNumber,
      color,
      variant,
      yearOfManufacture,
      exShowroomPrice,
      roadTax = 0,
      branchId,
      location = "Warehouse",
      uniqueBookRecord,
    } = req.body;

    // Validate required fields
    if (
      !modelName ||
      !category ||
      !engineCC ||
      !engineNumber ||
      !chassisNumber ||
      !color ||
      !variant ||
      !yearOfManufacture ||
      !exShowroomPrice ||
      !branchId
    ) {
      res.status(400);
      throw new Error("Please provide all required fields");
    }
    const normalizedEngine = engineNumber.toUpperCase();
    const normalizedChassis = chassisNumber.toUpperCase();

    const [duplicateInManual, duplicateInCSV] = await Promise.all([
      StockConceptModel.findOne({
        $or: [
          { engineNumber: normalizedEngine },
          { chassisNumber: normalizedChassis },
        ],
      })
        .select("_id stockId")
        .lean(),
      StockConceptCSVModel.findOne({
        $or: [
          { engineNumber: normalizedEngine },
          { chassisNumber: normalizedChassis },
        ],
      })
        .select("_id stockId")
        .lean(),
    ]);

    if (duplicateInManual || duplicateInCSV) {
      const source = duplicateInManual ? "manual stock" : "CSV stock";
      res.status(409);
      throw new Error(
        `Duplicate entry: engine/chassis number already exists in ${source}`
      );
    }

    // Generate stock ID
    const stockCount = await StockConceptModel.countDocuments();
    const stockId = `STK-${Date.now()}-${String(stockCount + 1).padStart(
      4,
      "0"
    )}`;

    // Calculate pricing
    const onRoadPrice = exShowroomPrice + roadTax;

    // Create stock item
    const stockItem = await StockConceptModel.create({
      stockId,
      modelName,
      category,
      engineCC,

      color,
      variant,
      yearOfManufacture,
      uniqueBookRecord,
      engineNumber: engineNumber.toUpperCase(),
      chassisNumber: chassisNumber.toUpperCase(),
      stockStatus: {
        status: "Available",
        location,
        branchId,
        lastUpdated: new Date(),
        updatedBy: req.user!._id,
      },
      priceInfo: {
        exShowroomPrice,
        roadTax,
        onRoadPrice,
      },
    });

    await stockItem.populate([
      { path: "stockStatus.branchId", select: "branchName address" },
    ]);

    logger.info(`Stock item created: ${stockItem.stockId} by ${req.user!._id}`);

    res.status(201).json({
      success: true,
      message: "Stock item created successfully",
      data: stockItem,
    });
  }
);

/**
 * @desc    Get all stock items
 * @route   GET /api/stock-concept
 * @access  Private (Super-Admin, Branch-Admin)
 */
export const getAllStockItems = asyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = { isActive: true };

    if (req.query.status) {
      filter["stockStatus.status"] = req.query.status;
    }
    if (req.query.location) {
      filter["stockStatus.location"] = req.query.location;
    }
    if (req.query.branchId) {
      filter["stockStatus.branchId"] = req.query.branchId;
    }
    if (req.query.category) {
      filter["category"] = req.query.category;
    }
    if (req.query.fuelType) {
      filter["fuelType"] = req.query.fuelType;
    }

    // Search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, "i");
      filter.$or = [
        { stockId: searchRegex },
        { modelName: searchRegex },
        { engineNumber: searchRegex },
        { chassisNumber: searchRegex },
      ];
    }

    const total = await StockConceptModel.countDocuments(filter);
    const stockItems = await StockConceptModel.find(filter)
      .populate("stockStatus.branchId", "branchName address")
      .populate("salesInfo.soldTo", "phoneNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: stockItems.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: stockItems,
    });
  }
);

export const getStockItemById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid stock item ID");
    }

    const stockItem = await StockConceptModel.findById(id).populate(
      "stockStatus.branchId",
      "branchName address phone"
    );

    if (!stockItem) {
      res.status(404);
      throw new Error("Stock item not found");
    }

    res.status(200).json({
      success: true,
      data: stockItem,
    });
  }
);

/**
 * @desc    Get customer's vehicles (stock items sold to them)
 * @route   GET /api/stock-concept/my-vehicles
 * @access  Private (Customer)
 */
export const getMyVehicles = asyncHandler(
  async (req: Request, res: Response) => {
    const customerId = req.customer?._id;

    if (!customerId) {
      res.status(401);
      throw new Error("Customer authentication required");
    }

    // Find all stock items sold to this customer
    const vehicles = await StockConceptModel.find({
      "salesInfo.soldTo": customerId,
      "stockStatus.status": "Sold",
      isActive: true,
    })
      .populate("stockStatus.branchId", "branchName address")
      .populate("salesInfo.salesPerson", "name email")
      .populate("salesInfo.customerVehicleId")
      .sort({ "salesInfo.soldDate": -1 });

    res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  }
);

/**
 * @desc    Get vehicle by ID (for customer dashboard)
 * @route   GET /api/
 * @access  Private (Customer/Admin)
 */
export const getVehicleById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid vehicle ID");
    }

    const vehicle = await StockConceptModel.findById(id)
      .populate("stockStatus.branchId", "branchName address")
      .populate("salesInfo.soldTo", "phoneNumber firstName lastName")
      .populate("salesInfo.salesPerson", "name email")
      .populate("salesInfo.customerVehicleId")
      .populate("salesHistory.soldTo", "phoneNumber firstName lastName")
      .populate("salesHistory.salesPerson", "name email");

    if (!vehicle) {
      res.status(404);
      throw new Error("Vehicle not found");
    }

    // Check if customer is accessing their own vehicle
    if (req.customer) {
      const isOwner =
        vehicle.salesInfo?.soldTo?._id?.toString() ===
        req.customer._id.toString();

      if (!isOwner) {
        res.status(403);
        throw new Error("Access denied: You can only view your own vehicles");
      }
    }

    res.status(200).json({
      success: true,
      data: vehicle,
    });
  }
);
