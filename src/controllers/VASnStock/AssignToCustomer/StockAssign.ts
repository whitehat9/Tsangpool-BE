import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { StockConceptModel } from "../../../models/BikeSystemModel2/StockConcept";
import { BaseCustomerModel } from "../../../models/CustomerSystem/BaseCustomer";
import { CustomerVehicleModel } from "../../../models/BikeSystemModel2/CustomerVehicleModel";
import logger from "../../../utils/logger";

/**
 * @desc    Assign stock item to customer
 * @route   PATCH /api/stock-concept/:id/assign
 * @access  Private (Super-Admin, Branch-Admin)
 */
export const activateToCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      customerId,
      salePrice,
      invoiceNumber,
      paymentStatus = "Pending",
      registrationDate,
      numberPlate,
      registeredOwnerName,
      insurance = false,
      isPaid = false,
      isFinance = false,
      rtoName, // Added parameter for RTO info
      rtoAddress, // Added parameter for RTO info
      state = "AS", // Default state
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid stock item ID");
    }

    // Validate required fields
    if (!customerId || !salePrice || !invoiceNumber) {
      res.status(400);
      throw new Error(
        "Please provide customer ID, sale price, and invoice number"
      );
    }

    // Check stock item exists and is available
    const stockItem = await StockConceptModel.findById(id);
    if (!stockItem) {
      res.status(404);
      throw new Error("Stock item not found");
    }

    if (stockItem.stockStatus.status !== "Available") {
      res.status(400);
      throw new Error("Stock item is not available for sale");
    }

    // Validate customer exists by ID
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400);
      throw new Error("Invalid customer ID");
    }

    const customer = await BaseCustomerModel.findById(customerId);
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }

    // Create RTO info object if numberPlate is provided
    let rtoInfo;
    if (numberPlate) {
      const rtoCode = numberPlate.substring(0, 4).toUpperCase();
      rtoInfo = {
        rtoCode,
        rtoName: rtoName || `RTO ${rtoCode}`, // Use provided name or generate one
        rtoAddress: rtoAddress || `RTO Office, ${state}`, // Use provided address or generate one
        state: state,
      };
    }

    // Create customer vehicle record
    const customerVehicle = await CustomerVehicleModel.create({
      stockConcept: stockItem._id,
      stockType: "StockConcept",
      modelName: stockItem.modelName,
      registrationDate: registrationDate
        ? new Date(registrationDate)
        : undefined,
      numberPlate: numberPlate?.toUpperCase(),
      insurance,
      isPaid,
      isFinance,
      color: stockItem.color,
      customer: customer._id, // Changed from customerPhoneNumber: customer._id
      registeredOwnerName: registeredOwnerName || undefined,
      rtoInfo: rtoInfo,
    });

    // Save previous owner to sales history if this is a resale
    if (stockItem.salesInfo && stockItem.salesInfo.soldTo) {
      stockItem.salesHistory.push({
        soldTo: stockItem.salesInfo.soldTo,
        soldDate: stockItem.salesInfo.soldDate || new Date(),
        salePrice: stockItem.salesInfo.salePrice || 0,
        salesPerson: stockItem.salesInfo.salesPerson!,
        invoiceNumber: stockItem.salesInfo.invoiceNumber || "",
        paymentStatus: stockItem.salesInfo.paymentStatus || "Pending",
        customerVehicleId: stockItem.salesInfo.customerVehicleId!,
        transferType: "Ownership Transfer",
      });
    }

    // Update stock item with sales information
    stockItem.salesInfo = {
      soldTo: new mongoose.Types.ObjectId(customer._id),
      soldDate: new Date(),
      salePrice,
      invoiceNumber,
      paymentStatus,
      customerVehicleId: new mongoose.Types.ObjectId(customerVehicle._id),
    };

    stockItem.stockStatus.status = "Sold";
    stockItem.stockStatus.location = "Customer";
    stockItem.stockStatus.lastUpdated = new Date();

    await stockItem.save();

    await stockItem.populate([
      { path: "salesInfo.soldTo", select: "phoneNumber" },
      { path: "stockStatus.branchId", select: "branchName" },
    ]);

    // Safely access req.user._id with optional chaining
    const userId = req.user?._id || "system";

    logger.info(
      `Stock item ${stockItem.stockId} assigned to customer ${customer.phoneNumber} by ${userId}`
    );

    res.status(200).json({
      success: true,
      message: "Stock item successfully assigned to customer",
      data: {
        stockItem,
        customerVehicle: {
          _id: customerVehicle._id,
          numberPlate: customerVehicle.numberPlate,
        },
      },
    });
  }
);
