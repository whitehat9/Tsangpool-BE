import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/dbConnection";
import rateLimit from "express-rate-limit";
import corsOptions from "./config/corOptions";
import { errorHandler, routeNotFound } from "./middleware/errorMiddleware";
//Routes
import auth from "./routes/auth";
import bikes from "./routes/BikeSystemRoutes/bikes.routes";
import bikeImages from "./routes/BikeSystemRoutes/bikeImages.routes";
import enquiryRoutes from "./routes/enquiryForm";
import branchRoutes from "./routes/branches";
import cloudinaryRoutes from "./routes/cloudinary";
import getApprovedRoutes from "./routes/getapproved";
import visitorRoutes from "./routes/visitorR";
import contactRoutes from "./routes/contact";
import customerRoutes from "./routes/customerRoutes/customer";
import customerProfile from "./routes/customerRoutes/customerProfile";
import serviceBookingRoutes from "./routes/customerRoutes/serviceBooking";
import valueAddedServicesRoutes from "./routes/BikeSystemRoutes2/VAS";
import vehicleInfoRoutes from "./routes/BikeSystemRoutes2/CustomerVehicleRoutes";
import stockConceptRoutes from "./routes/BikeSystemRoutes2/stockConcept";
import csvStockImportRoutes from "./routes/BikeSystemRoutes3/csvStock";
import accidentReports from "./routes/AdminFeature/accidentReport";
//
import scanfleetRoutes from "./routes/Scanfleet/routes.scanfleet";

dotenv.config();

// Create Express application
const app: Application = express();
const PORT = process.env.PORT || 8080;

//CORS
app.use(cors(corsOptions));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// Health check endpoints (no rate limiting)
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Honda-Dealer Golaghat API is running",
    version: "1.0.0",
  });
});
app.get("/_ah/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

app.get("/_ah/start", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Apply rate limiter to all /api routes
app.use("/api", apiLimiter);

// Admin & Auth
app.use("/api/adminLogin", auth);
app.use("/api/branch", branchRoutes);

// Bike System
app.use("/api/bikes", bikes);
app.use("/api/bike-images", bikeImages);
app.use("/api/stock-concept", stockConceptRoutes);
app.use("/api/value-added-services", valueAddedServicesRoutes);
app.use("/api/csv-stock", csvStockImportRoutes);

// Customer System
app.use("/api/customer", customerRoutes);
app.use("/api/customer-profile", customerProfile);
app.use("/api/customer-vehicles", vehicleInfoRoutes);
app.use("/api/service-bookings", serviceBookingRoutes);

// Other Services
app.use("/api/cloudinary", cloudinaryRoutes);
app.use("/api/enquiry-form", enquiryRoutes);
app.use("/api/getapproved", getApprovedRoutes); // this
app.use("/api/messages", contactRoutes);
app.use("/api/accident-reports", accidentReports);
app.use("/api/visitor", visitorRoutes);

//Third Party
app.use("/api/scanfleet", scanfleetRoutes);

// Global error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Global error handler:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  res.status(500).json({
    success: false,
    error: "Something went wrong!",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

// 404 handler
app.use(routeNotFound);

// Custom error handler
app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
});

export default app;
