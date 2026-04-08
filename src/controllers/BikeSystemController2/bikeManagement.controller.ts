// controllers/BikeSystemController2/bikeManagement.controller.ts
import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import mongoose from "mongoose";
import logger from "../../utils/logger";
import BikeModel from "../../models/BikeSystemModel/Bikes";
import BikeImageModel from "../../models/BikeSystemModel/BikeImageModel";
import { CustomerVehicleModel } from "../../models/BikeSystemModel2/CustomerVehicleModel";
import { BaseCustomerModel } from "../../models/CustomerSystem/BaseCustomer";

/**
 * @desc    Get all available bikes for customer assignment
 * @route   GET /api/bikes/available
 * @access  Private/Admin
 */
export const getAvailableBikes = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, category, search } = req.query;

    // Build query
    const query: any = {
      isActive: true,
      stockAvailable: { $gt: 0 },
    };

    if (category) {
      query.mainCategory = category;
    }

    if (search) {
      query.$or = [
        { modelName: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { engineSize: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bikes, total] = await Promise.all([
      BikeModel.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      BikeModel.countDocuments(query),
    ]);

    // Get images for each bike
    const bikesWithImages = await Promise.all(
      bikes.map(async (bike) => {
        const images = await BikeImageModel.find({
          bikeId: bike._id,
          isActive: true,
        })
          .sort({ isPrimary: -1, createdAt: 1 })
          .lean();

        return {
          ...bike,
          images,
        };
      }),
    );

    res.json({
      success: true,
      data: bikesWithImages,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  },
);

/**
 * @desc    Get bike by ID with images
 * @route   GET /api/bikes/:id
 * @access  Private/Admin
 */
export const getBikeById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid bike ID");
  }

  const bike = await BikeModel.findById(id);
  if (!bike) {
    res.status(404);
    throw new Error("Bike not found");
  }

  res.json({
    success: true,
    data: bike,
  });
});

/**
 * @desc    Assign bike to customer
 * @route   POST /api/bikes/:id/assign
 * @access  Private/Admin
 */
export const assignBikeToCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      customerId,
      registrationDate,
      numberPlate,
      registeredOwnerName,
      purchaseDate,
    } = req.body;

    // Validate bike ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid bike ID");
    }

    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400);
      throw new Error("Invalid customer ID");
    }

    // Check bike exists and is available
    const bike = await BikeModel.findById(id);
    if (!bike) {
      res.status(404);
      throw new Error("Bike not found");
    }

    if (bike.stockAvailable <= 0) {
      res.status(400);
      throw new Error("Bike is out of stock");
    }

    // Check customer exists
    const customer = await BaseCustomerModel.findById(customerId);
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }

    // Check if customer already has a vehicle
    const existingVehicle = await CustomerVehicleModel.findOne({
      customer: customerId,
      isActive: true,
    });

    if (existingVehicle) {
      res.status(400);
      throw new Error("Customer already has an assigned vehicle");
    }

    // Create customer vehicle record
    const customerVehicle = await CustomerVehicleModel.create({
      bike: bike._id,
      customer: customerId,
      registrationDate: registrationDate
        ? new Date(registrationDate)
        : undefined,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      numberPlate: numberPlate?.trim().toUpperCase(),
      registeredOwnerName: registeredOwnerName?.trim(),
      isPaid: false,
      isFinance: false,
      insurance: false,
      serviceStatus: {
        kilometers: 0,
        serviceHistory: 0,
      },
    });

    // Decrease bike stock
    await BikeModel.findByIdAndUpdate(id, {
      $inc: { stockAvailable: -1 },
    });

    // Populate the response
    const populatedVehicle = await CustomerVehicleModel.findById(
      customerVehicle._id,
    )
      .populate("customer", "fullName phoneNumber email")
      .populate("bike");

    logger.info(
      `Bike ${bike.modelName} assigned to customer ${customer.fullName}`,
    );

    res.status(201).json({
      success: true,
      message: "Bike assigned to customer successfully",
      data: populatedVehicle,
    });
  },
);

/**
 * @desc    Remove bike assignment from customer
 * @route   DELETE /api/bikes/:id/unassign
 * @access  Private/Admin
 */
export const unassignBikeFromCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid bike ID");
    }

    // Find customer vehicle with this bike
    const customerVehicle = await CustomerVehicleModel.findOne({
      bike: id,
      isActive: true,
    }).populate("bike customer");

    if (!customerVehicle) {
      res.status(404);
      throw new Error("No active assignment found for this bike");
    }

    // Deactivate the customer vehicle
    await CustomerVehicleModel.findByIdAndUpdate(customerVehicle._id, {
      isActive: false,
    });

    // Increase bike stock back
    await BikeModel.findByIdAndUpdate(id, {
      $inc: { stockAvailable: 1 },
    });

    logger.info(
      `Bike ${(customerVehicle.bike as any).modelName} unassigned from customer ${(customerVehicle.customer as any).fullName}`,
    );

    res.json({
      success: true,
      message: "Bike unassigned successfully",
    });
  },
);

/**
 * @desc    Get bike assignment history
 * @route   GET /api/bikes/:id/assignments
 * @access  Private/Admin
 */
export const getBikeAssignments = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid bike ID");
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [assignments, total] = await Promise.all([
      CustomerVehicleModel.find({ bike: id })
        .populate("customer", "fullName phoneNumber email")
        .populate("bike", "modelName category engineSize")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CustomerVehicleModel.countDocuments({ bike: id }),
    ]);

    res.json({
      success: true,
      data: assignments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  },
);

/**
 * @desc    Update bike stock
 * @route   PATCH /api/bikes/:id/stock
 * @access  Private/Admin
 */
export const updateBikeStock = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { stockAvailable } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid bike ID");
    }

    if (typeof stockAvailable !== "number" || stockAvailable < 0) {
      res.status(400);
      throw new Error("Stock must be a non-negative number");
    }

    const bike = await BikeModel.findByIdAndUpdate(
      id,
      { stockAvailable },
      { new: true, runValidators: true },
    );

    if (!bike) {
      res.status(404);
      throw new Error("Bike not found");
    }

    res.json({
      success: true,
      message: "Bike stock updated successfully",
      data: bike,
    });
  },
);
