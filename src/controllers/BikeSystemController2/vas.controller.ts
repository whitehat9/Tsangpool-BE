import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import ValueAddedServiceModel from "../../models/BikeSystemModel2/VASmodel";
import logger from "../../utils/logger";
import {
  CustomerVehicleModel,
  ICustomerVehicle,
} from "../../models/BikeSystemModel2/CustomerVehicleModel";

export const createValueAddedService = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      serviceName,
      coverageYears,
      priceStructure,
      benefits,
      isActive,
      applicableBranches,
    } = req.body;

    // Validate required fields
    if (!serviceName || !coverageYears || !priceStructure?.basePrice) {
      res.status(400);
      throw new Error(
        "Missing required fields: serviceName, coverageYears, priceStructure.basePrice"
      );
    }

    // Validate benefits array
    if (benefits && (!Array.isArray(benefits) || benefits.length === 0)) {
      res.status(400);
      throw new Error("Benefits must be a non-empty array");
    }

    const serviceData = {
      serviceName: serviceName.trim(),
      coverageYears: Number(coverageYears),
      priceStructure: {
        basePrice: Number(priceStructure.basePrice),
      },
      benefits: benefits || [],
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      applicableBranches: applicableBranches || [],
    };

    const service = await ValueAddedServiceModel.create(serviceData);

    logger.info(`Value Added Service created: ${service.serviceName}`);

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  }
);

/**
 * @desc    Get all value added services
 * @route   GET /api/value-added-services/admin
 * @access  Private (Admin)
 */
export const getAllValueAddedServices = asyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.isActive !== undefined)
      filter.isActive = req.query.isActive === "true";

    const total = await ValueAddedServiceModel.countDocuments(filter);
    const services = await ValueAddedServiceModel.find(filter)
      .populate("applicableBranches", "branchName address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: services.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: services,
    });
  }
);

/**
 * @desc    Get service by ID
 * @route   GET /api/value-added-services/admin/:id
 * @access  Private (Admin)
 */
export const getValueAddedServiceById = asyncHandler(
  async (req: Request, res: Response) => {
    const service = await ValueAddedServiceModel.findById(
      req.params.id
    ).populate("applicableBranches", "branchName address");

    if (!service) {
      res.status(404);
      throw new Error("Service not found");
    }

    res.status(200).json({
      success: true,
      data: service,
    });
  }
);

/**
 * @desc    Update value added service
 * @route   PUT /api/value-added-services/admin/:id
 * @access  Private (Admin)
 */
export const updateValueAddedService = asyncHandler(
  async (req: Request, res: Response) => {
    const service = await ValueAddedServiceModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("applicableBranches", "branchName address");

    if (!service) {
      res.status(404);
      throw new Error("Service not found");
    }

    logger.info(`Value Added Service updated: ${service.serviceName}`);

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });
  }
);

/**
 * @desc    Delete value added service
 * @route   DELETE /api/value-added-services/admin/:id
 * @access  Private (Super-Admin)
 */
export const deleteValueAddedService = asyncHandler(
  async (req: Request, res: Response) => {
    const service = await ValueAddedServiceModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!service) {
      res.status(404);
      throw new Error("Service not found");
    }

    logger.warn(`Value Added Service deleted: ${service.serviceName}`);

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  }
);

/**
 * @desc    Get eligible services for customer
 * @route   GET /api/value-added-services/eligible
 * @access  Private (Customer)
 */
export const getCustomerEligibleServices = asyncHandler(
  async (req: Request, res: Response) => {
    const customerId = req.customer?._id;

    const vehicles = await CustomerVehicleModel.find({
      customer: customerId,
      isActive: true,
    });

    if (vehicles.length === 0) {
      res.status(404).json({
        success: false,
        message: "No vehicles found",
      });
      return;
    }

    const eligibleServices = await Promise.all(
      vehicles.map(async (vehicle: ICustomerVehicle) => {
        // Get vehicle age in months
        const vehicleAgeMonths = Math.floor(
          (new Date().getTime() -
            new Date(vehicle.registrationDate || vehicle.createdAt).getTime()) /
            (1000 * 60 * 60 * 24 * 30)
        );

        // Find eligible services
        const services = await ValueAddedServiceModel.find({
          isActive: true,
          validFrom: { $lte: new Date() },
          validUntil: { $gte: new Date() },
          maxEnrollmentPeriod: { $gte: vehicleAgeMonths },
        });

        const eligibleForVehicle = services.filter(
          (service) => (service as any).isVehicleEligible(125, "commuter") // Mock data
        );

        return {
          vehicle: {
            _id: vehicle._id,

            numberPlate: vehicle.numberPlate,
            registrationDate: vehicle.registrationDate,
            ageMonths: vehicleAgeMonths,
          },
          eligibleServices: eligibleForVehicle,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: eligibleServices,
    });
  }
);

/**
 * @desc    Calculate service price
 * @route   POST /api/value-added-services/calculate-price
 * @access  Private (Customer)
 */
export const calculateServicePrice = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceId, vehicleId, selectedYears } = req.body;

    const service = await ValueAddedServiceModel.findById(serviceId);
    const vehicle = await CustomerVehicleModel.findById(vehicleId);

    if (!service || !vehicle) {
      res.status(404);
      throw new Error("Service or vehicle not found");
    }

    const engineCapacity = 125; // Mock - extract from vehicle data
    const price = (service as any).calculatePrice(
      engineCapacity,
      selectedYears
    );

    res.status(200).json({
      success: true,
      data: {
        service: service.serviceName,
        vehicle: vehicle.numberPlate,
        selectedYears,
        calculatedPrice: price,
      },
    });
  }
);

/**
 * @desc    Get services by type
 * @route   GET /api/value-added-services/types/:serviceType
 * @access  Public
 */
export const getServicesByType = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceType } = req.params;

    const services = await ValueAddedServiceModel.find({
      serviceType,
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    }).select(
      "serviceName description benefits coverage priceStructure badges"
    );

    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  }
);

/**
 * @desc    Get customer active services
 * @route   GET /api/value-added-services/my-services
 * @access  Private (Customer)
 */
export const getCustomerActiveServices = asyncHandler(
  async (req: Request, res: Response) => {
    const customerId = req.customer?._id;

    const vehicles = await CustomerVehicleModel.find({
      customer: customerId,
      isActive: true,
    })
    .populate(
      "activeValueAddedServices.serviceId",
      "serviceName serviceType description"
    );

    // Use the activeValueAddedServices array from the vehicle model
    const activeServices = vehicles.map((vehicle: ICustomerVehicle) => ({
      vehicle: {
        _id: vehicle._id,

        numberPlate: vehicle.numberPlate,
        customer: customerId,
      },
      services: vehicle.activeValueAddedServices
        .filter((service) => service.isActive)
        .map((service) => ({
          serviceId: service.serviceId,
          serviceName: (service.serviceId as any)?.serviceName,
          serviceType: (service.serviceId as any)?.serviceType,
          activatedDate: service.activatedDate,
          expiryDate: service.expiryDate,
          purchasePrice: service.purchasePrice,
          coverageYears: service.coverageYears,

          isActive: service.isActive,
        })),
    }));

    res.status(200).json({
      success: true,
      data: activeServices,
    });
  }
);

/**
 * @desc    Get all customers with active VAS (Admin)
 * @route   GET /api/value-added-services/admin/customers
 * @access  Private (Admin)
 */
export const getCustomersWithActiveVAS = asyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const vehicles = await CustomerVehicleModel.find({
      isActive: true,
      "activeValueAddedServices.0": { $exists: true }, // Has at least one VAS
    })
      .populate("customer", "phoneNumber")
      .populate("activeValueAddedServices.serviceId", "serviceName serviceType")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CustomerVehicleModel.countDocuments({
      isActive: true,
      "activeValueAddedServices.0": { $exists: true },
    });

    const customersWithVAS = vehicles.map((vehicle) => ({
      customer: {
        _id: (vehicle.customer as any)?._id,
        phoneNumber: (vehicle.customer as any)?.phoneNumber,
      },
      vehicle: {
        _id: vehicle._id,

        numberPlate: vehicle.numberPlate,
      },
      activeServices: vehicle.activeValueAddedServices
        .filter((service) => service.isActive)
        .map((service) => ({
          serviceId: service.serviceId,
          serviceName: (service.serviceId as any)?.serviceName,
          serviceType: (service.serviceId as any)?.serviceType,
          activatedDate: service.activatedDate,
          expiryDate: service.expiryDate,
          purchasePrice: service.purchasePrice,
        })),
    }));

    res.status(200).json({
      success: true,
      count: customersWithVAS.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: customersWithVAS,
    });
  }
);
