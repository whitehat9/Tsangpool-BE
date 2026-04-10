import express, { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

// Google Places API configuration
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_BASE_URL = "https://maps.googleapis.com/maps/api";

if (!GOOGLE_PLACES_API_KEY) {
  console.warn(
    "GOOGLE_PLACES_API_KEY is not configured in server environment variables",
  );
}

// Rate limiting for Google Places API calls
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

const checkRateLimit = (req: Request): boolean => {
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const requests = rateLimitMap.get(clientIp) || [];

  // Remove old requests outside the window
  const validRequests = requests.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW,
  );

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(clientIp, validRequests);
  return true;
};

// Get place details
router.get("/place-details", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkRateLimit(req)) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    const { place_id, fields } = req.query;

    if (!place_id) {
      res.status(400).json({
        success: false,
        error: "place_id parameter is required",
      });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      res.status(500).json({
        success: false,
        error: "Google Places API is not configured on the server",
      });
      return;
    }

    const defaultFields =
      "name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,geometry,opening_hours,photos";
    const requestedFields = fields || defaultFields;

    const apiUrl = `${PLACES_API_BASE_URL}/place/details/json?place_id=${encodeURIComponent(place_id as string)}&fields=${encodeURIComponent(requestedFields as string)}&key=${GOOGLE_PLACES_API_KEY}`;

    const response = await axios.get<any>(apiUrl);

    if (response.data.status !== "OK") {
      res.status(400).json({
        success: false,
        error: `Google Places API error: ${response.data.status}`,
        message: response.data.error_message || "Unknown error",
      });
      return;
    }

    res.json({
      success: true,
      data: response.data.result,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch place details",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get autocomplete suggestions
router.get("/autocomplete", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkRateLimit(req)) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    const { input, types, components } = req.query;

    if (!input) {
      res.status(400).json({
        success: false,
        error: "input parameter is required",
      });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      res.status(500).json({
        success: false,
        error: "Google Places API is not configured on the server",
      });
      return;
    }

    const defaultTypes = "establishment";
    const requestedTypes = types || defaultTypes;

    let apiUrl = `${PLACES_API_BASE_URL}/place/autocomplete/json?input=${encodeURIComponent(input as string)}&types=${encodeURIComponent(requestedTypes as string)}&key=${GOOGLE_PLACES_API_KEY}`;

    if (components) {
      apiUrl += `&components=${encodeURIComponent(components as string)}`;
    }

    const response = await axios.get<any>(apiUrl);

    if (response.data.status !== "OK") {
      res.status(400).json({
        success: false,
        error: `Google Places API error: ${response.data.status}`,
        message: response.data.error_message || "Unknown error",
      });
      return;
    }

    res.json({
      success: true,
      data: response.data.predictions,
    });
  } catch (error) {
    console.error("Error fetching autocomplete suggestions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch autocomplete suggestions",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Search nearby places
router.get("/nearbysearch", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkRateLimit(req)) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    const { location, radius, type, keyword } = req.query;

    if (!location) {
      res.status(400).json({
        success: false,
        error: "location parameter is required (format: lat,lng)",
      });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      res.status(500).json({
        success: false,
        error: "Google Places API is not configured on the server",
      });
      return;
    }

    const defaultRadius = 5000; // 5km
    const defaultType = "car_dealer";
    const requestedRadius = radius ? parseInt(radius as string) : defaultRadius;
    const requestedType = type || defaultType;

    let apiUrl = `${PLACES_API_BASE_URL}/place/nearbysearch/json?location=${encodeURIComponent(location as string)}&radius=${requestedRadius}&type=${requestedType}&key=${GOOGLE_PLACES_API_KEY}`;

    if (keyword) {
      apiUrl += `&keyword=${encodeURIComponent(keyword as string)}`;
    }

    const response = await axios.get<any>(apiUrl);

    if (
      response.data.status !== "OK" &&
      response.data.status !== "ZERO_RESULTS"
    ) {
      res.status(400).json({
        success: false,
        error: `Google Places API error: ${response.data.status}`,
        message: response.data.error_message || "Unknown error",
      });
      return;
    }

    res.json({
      success: true,
      data: response.data.results || [],
    });
  } catch (error) {
    console.error("Error searching nearby places:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search nearby places",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get photo URL (this returns a proxied image)
router.get("/photo", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkRateLimit(req)) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    const { photoreference, maxwidth } = req.query;

    if (!photoreference) {
      res.status(400).json({
        success: false,
        error: "photoreference parameter is required",
      });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      res.status(500).json({
        success: false,
        error: "Google Places API is not configured on the server",
      });
      return;
    }

    const defaultMaxWidth = 400;
    const requestedMaxWidth = maxwidth
      ? parseInt(maxwidth as string)
      : defaultMaxWidth;

    const photoUrl = `${PLACES_API_BASE_URL}/place/photo?maxwidth=${requestedMaxWidth}&photoreference=${encodeURIComponent(photoreference as string)}&key=${GOOGLE_PLACES_API_KEY}`;

    // Fetch image and proxy it
    const response = await axios.get<any>(photoUrl, { responseType: "arraybuffer" });

    res.set({
      "Content-Type": response.headers["content-type"],
      "Content-Length": response.data.length,
      "Cache-Control": "public, max-age=86400", // Cache for 1 day
    });

    res.send(response.data);
  } catch (error) {
    console.error("Error fetching photo:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch photo",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
