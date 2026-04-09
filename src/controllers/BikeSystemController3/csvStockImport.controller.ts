import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { parse } from "csv-parse";

import { detectCSVSchema } from "../../utils/csvSchemaDetector";
import { StockConceptCSVModel } from "../../models/BikeSystemModel3/StockConceptCSV";
import mongoose, { Types } from "mongoose";
import { StockConceptModel } from "../../models/BikeSystemModel2/StockConcept";
import { CustomerVehicleModel } from "../../models/BikeSystemModel2/CustomerVehicleModel";

export const importCSVStock = asyncHandler(
  async (req: Request, res: Response) => {
    const file = req.file;
    const { defaultBranchId } = req.body;

    if (!file) {
      res.status(400);
      throw new Error("CSV file required");
    }

    if (!defaultBranchId) {
      res.status(400);
      throw new Error("defaultBranchId required");
    }

    // Change parse implementation to:
    const records = await new Promise<Record<string, any>[]>(
      (resolve, reject) => {
        parse(
          file.buffer,
          {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          },
          (err, output: unknown) => {
            if (err) reject(err);
            else resolve(output as Record<string, any>[]);
          }
        );
      }
    );

    // Detect schema
    const schema = detectCSVSchema(records);

    // Generate batch ID
    const batchId = `CSV-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;
    const importDate = new Date();

    const results = {
      success: false,
      totalRows: records.length,
      successCount: 0,
      failureCount: 0,
      batchId,
      detectedColumns: schema.columns,
      errors: [] as any[],
      created: [] as string[],
    };

    // Process records
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2;

      try {
        // Extract core fields using detected mappings
        const modelName = row[schema.mappings.modelName];
        const engineNumber = row[schema.mappings.engineNumber]?.toUpperCase();
        const chassisNumber = row[schema.mappings.chassisNumber]?.toUpperCase();
        const color = row[schema.mappings.color];
        const location =
          row[schema.mappings.location]?.toUpperCase() || "WAREHOUSE";

        if (!engineNumber || !chassisNumber) {
          throw new Error("Engine/Chassis number missing");
        }

        // Check duplicates across BOTH models
        const [existingCSV, existingStock] = await Promise.all([
          StockConceptCSVModel.findOne({
            $or: [{ engineNumber }, { chassisNumber }],
          }),
          mongoose.model("StockConcept").findOne({
            $or: [{ engineNumber }, { chassisNumber }],
          }),
        ]);

        if (existingCSV || existingStock) {
          throw new Error(`Duplicate: ${engineNumber || chassisNumber}`);
        }

        // Generate stock ID
        const stockCount = await StockConceptCSVModel.countDocuments();
        const stockId = `CSV-${Date.now()}-${String(stockCount + 1).padStart(
          4,
          "0"
        )}`;

        // Create with ALL CSV data
        const csvStock = await StockConceptCSVModel.create({
          stockId,
          modelName,
          engineNumber,
          chassisNumber,
          color,

          csvImportBatch: batchId,
          csvImportDate: importDate,
          csvFileName: file.originalname,

          // Store ALL columns dynamically
          csvData: row,
          detectedColumns: schema.columns,
          schemaVersion: 1,

          stockStatus: {
            status: "Available",
            location,
            branchId: defaultBranchId,
            updatedBy: req.user!._id,
          },
        });

        results.created.push(csvStock.stockId);
        results.successCount++;
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          row: rowNumber,
          data: row,
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }

    results.success = results.failureCount === 0;

    res.status(results.success ? 201 : 207).json({
      success: true,
      message: `Imported ${results.successCount}/${results.totalRows}`,
      data: results,
    });
  }
);

// Get all CSV stocks
export const getCSVStocks = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 20, batchId, status, location } = req.query;

    const query: any = {};
    if (batchId) query.csvImportBatch = batchId;
    if (status) query["stockStatus.status"] = status;
    if (location) query["stockStatus.location"] = location;

    const skip = (Number(page) - 1) * Number(limit);

    const [stocks, total] = await Promise.all([
      StockConceptCSVModel.find(query)
        .populate("stockStatus.branchId", "branchName")
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      StockConceptCSVModel.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: stocks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  }
);

export const assignCSVStockToCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const { stockId } = req.params;
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
    } = req.body;

    if (!customerId || !salePrice || !invoiceNumber) {
      res.status(400);
      throw new Error("customerId, salePrice, and invoiceNumber are required");
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400);
      throw new Error("Invalid customerId");
    }

    // Support both _id (ObjectId) and stockId (string) lookup
    const isObjectId =
      mongoose.Types.ObjectId.isValid(stockId) && stockId.length === 24;
    const query = isObjectId ? { _id: stockId } : { stockId };

    const stock = await StockConceptCSVModel.findOne(query);
    if (!stock) {
      res.status(404);
      throw new Error("CSV stock not found");
    }

    if (stock.stockStatus.status !== "Available") {
      res.status(409);
      throw new Error("Stock is not available for assignment");
    }

    // Check customer exists
    const { BaseCustomerModel } = await import(
      "../../models/CustomerSystem/BaseCustomer"
    );
    const customer = await BaseCustomerModel.findById(customerId);
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }

    // Check customer doesn't already have a vehicle
    const existingVehicle = await CustomerVehicleModel.findOne({
      customer: customerId,
    });
    if (existingVehicle) {
      res.status(409);
      throw new Error("Customer already has a vehicle assigned");
    }

    const customerVehicle = await CustomerVehicleModel.create({
      stockConcept: stock._id,
      stockType: "StockConceptCSV",
      customer: customerId,
      registrationDate,
      numberPlate,
      registeredOwnerName,
      isPaid,
      isFinance,
      insurance,
    });

    stock.stockStatus.status = "Sold";
    stock.salesInfo = {
      soldTo: new Types.ObjectId(customerId),
      soldDate: new Date(),
      salePrice: Number(salePrice),
      invoiceNumber,
      paymentStatus,
      customerVehicleId: new Types.ObjectId(customerVehicle._id as string),
    };

    await stock.save();

    res.status(200).json({
      success: true,
      message: "CSV stock assigned successfully",
      data: { stock, customerVehicle },
    });
  }
);

/**
 * @desc    Get stocks from specific CSV batch
 * @route   GET /api/stock-concept/csv-batch/:batchId
 * @access  Private (Admin)
 */
export const getStocksByCSVBatch = asyncHandler(
  async (req: Request, res: Response) => {
    const { batchId } = req.params;

    const stocks = await StockConceptModel.find({
      csvImportBatch: batchId,
    })
      .populate("stockStatus.branchId", "branchName address")
      .sort({ createdAt: 1 });

    if (stocks.length === 0) {
      res.status(404);
      throw new Error("No stocks found for this batch ID");
    }

    res.status(200).json({
      success: true,
      batchId,
      count: stocks.length,
      data: stocks,
    });
  }
);
// Get single CSV stock
export const getCSVStockByStockId = asyncHandler(
  async (req: Request, res: Response) => {
    const { stockId } = req.params;

    const stock = await StockConceptCSVModel.findOne({ stockId })
      .populate("stockStatus.branchId", "branchName address")
      .populate("salesInfo.soldTo", "fullName phoneNumber")
      .populate("salesInfo.customerVehicleId");

    if (!stock) {
      res.status(404);
      throw new Error("CSV stock not found");
    }

    res.json({
      success: true,
      data: stock,
    });
  }
);
// Get CSV batches (folders)
export const getCSVBatches = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const batches = await StockConceptCSVModel.aggregate([
      {
        $group: {
          _id: "$csvImportBatch",
          fileName: { $first: "$csvFileName" },
          importDate: { $first: "$csvImportDate" },
          totalStocks: { $sum: 1 },
          availableStocks: {
            $sum: {
              $cond: [{ $eq: ["$stockStatus.status", "Available"] }, 1, 0],
            },
          },
          soldStocks: {
            $sum: {
              $cond: [{ $eq: ["$stockStatus.status", "Sold"] }, 1, 0],
            },
          },
          models: { $addToSet: "$modelName" },
          locations: { $addToSet: "$stockStatus.location" },
        },
      },
      { $sort: { importDate: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ]);

    const totalBatches = await StockConceptCSVModel.distinct("csvImportBatch");

    res.json({
      success: true,
      data: batches.map((b) => ({
        batchId: b._id,
        fileName: b.fileName,
        importDate: b.importDate,
        totalStocks: b.totalStocks,
        availableStocks: b.availableStocks,
        soldStocks: b.soldStocks,
        models: b.models,
        locations: b.locations,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalBatches.length,
        pages: Math.ceil(totalBatches.length / Number(limit)),
      },
    });
  }
);

// Get stocks by batch (files in folder)
export const getStocksByBatch = asyncHandler(
  async (req: Request, res: Response) => {
    const { batchId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const query: any = { csvImportBatch: batchId };
    if (status) query["stockStatus.status"] = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [stocks, total] = await Promise.all([
      StockConceptCSVModel.find(query)
        .populate("stockStatus.branchId", "branchName")
        .populate("salesInfo.soldTo", "fullName phoneNumber")
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: 1 }),
      StockConceptCSVModel.countDocuments(query),
    ]);

    if (stocks.length === 0) {
      res.status(404);
      throw new Error("Batch not found");
    }

    res.json({
      success: true,
      batchId,
      data: stocks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  }
);

// Update stock status
export const updateCSVStockStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { stockId } = req.params;
    const { status, location } = req.body;

    const validStatuses = ["Available", "Sold", "Reserved", "Service"];
    if (status && !validStatuses.includes(status)) {
      res.status(400);
      throw new Error("Invalid status");
    }

    const stock = await StockConceptCSVModel.findOne({ stockId });

    if (!stock) {
      res.status(404);
      throw new Error("Stock not found");
    }

    if (status) stock.stockStatus.status = status;
    if (location) stock.stockStatus.location = location.toUpperCase();
    stock.stockStatus.updatedBy = req.user!._id as mongoose.Types.ObjectId;

    await stock.save();

    res.json({
      success: true,
      message: "Status updated",
      data: stock,
    });
  }
);

// Soft delete CSV stock
export const deleteCSVStock = asyncHandler(
  async (req: Request, res: Response) => {
    const { stockId } = req.params;

    const stock = await StockConceptCSVModel.findOne({ stockId });

    if (!stock) {
      res.status(404);
      throw new Error("Stock not found");
    }

    if (stock.stockStatus.status === "Sold") {
      res.status(400);
      throw new Error("Cannot delete sold stock");
    }

    stock.isActive = false;
    await stock.save();

    res.json({
      success: true,
      message: "Stock deleted",
    });
  }
);

// Unassign (reverse assignment)
export const unassignCSVStock = asyncHandler(
  async (req: Request, res: Response) => {
    const { stockId } = req.params;
    const { reason } = req.body;

    const stock = await StockConceptCSVModel.findOne({ stockId });

    if (!stock) {
      res.status(404);
      throw new Error("Stock not found");
    }

    if (stock.stockStatus.status !== "Sold") {
      res.status(400);
      throw new Error("Stock not assigned");
    }

    const customerVehicleId = stock.salesInfo?.customerVehicleId;

    // Delete customer vehicle record
    if (customerVehicleId) {
      await CustomerVehicleModel.findByIdAndDelete(customerVehicleId);
    }

    // Reset stock
    stock.stockStatus.status = "Available";
    stock.salesInfo = undefined;

    await stock.save();

    res.json({
      success: true,
      message: "Stock unassigned",
      data: stock,
      reason,
    });
  }
);
