import cors from "cors";
import express from "express";
import { getLocationData, reverseGeocode, searchPlaces } from "./services/openMeteo.js";
import { getQueryString } from "./utils/query.js";

type ApiServices = {
  searchPlaces: typeof searchPlaces;
  getLocationData: typeof getLocationData;
  reverseGeocode: typeof reverseGeocode;
};

const defaultServices: ApiServices = {
  searchPlaces,
  getLocationData,
  reverseGeocode
};

export function createApp(services: ApiServices = defaultServices) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/search", async (req, res) => {
    try {
      const q = getQueryString(req.query.q, "").trim();

      if (!q) {
        return res.status(400).json({ message: "Query param 'q' is required." });
      }

      const results = await services.searchPlaces(q);
      return res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ message });
    }
  });

  app.get("/api/location-data", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const timezone = getQueryString(req.query.timezone, "auto");

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ message: "Valid 'lat' and 'lon' are required." });
      }

      const result = await services.getLocationData(lat, lon, timezone);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ message });
    }
  });

  app.get("/api/reverse-geocode", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ message: "Valid 'lat' and 'lon' are required." });
      }

      const result = await services.reverseGeocode(lat, lon);
      return res.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ message });
    }
  });

  return app;
}
