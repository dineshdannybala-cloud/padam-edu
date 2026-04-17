import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

describe("server integration routes", () => {
  it("GET /api/health returns ok", async () => {
    const app = createApp({
      searchPlaces: vi.fn(),
      getLocationData: vi.fn(),
      reverseGeocode: vi.fn()
    });

    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /api/search validates missing query", async () => {
    const app = createApp({
      searchPlaces: vi.fn(),
      getLocationData: vi.fn(),
      reverseGeocode: vi.fn()
    });

    const response = await request(app).get("/api/search");
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("q");
  });

  it("GET /api/search returns results", async () => {
    const searchPlaces = vi.fn().mockResolvedValue([{ id: 1, name: "Bengaluru", latitude: 12.97, longitude: 77.59 }]);
    const app = createApp({
      searchPlaces,
      getLocationData: vi.fn(),
      reverseGeocode: vi.fn()
    });

    const response = await request(app).get("/api/search").query({ q: "Bengaluru" });
    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(searchPlaces).toHaveBeenCalledWith("Bengaluru");
  });

  it("GET /api/location-data validates coordinates", async () => {
    const app = createApp({
      searchPlaces: vi.fn(),
      getLocationData: vi.fn(),
      reverseGeocode: vi.fn()
    });

    const response = await request(app).get("/api/location-data").query({ lat: "x", lon: "77" });
    expect(response.status).toBe(400);
  });

  it("GET /api/location-data returns weather payload", async () => {
    const getLocationData = vi.fn().mockResolvedValue({
      location: { latitude: 12.97, longitude: 77.59, timezone: "Asia/Kolkata" },
      current: { temperature_2m: 30 },
      daily: { time: ["2026-04-16"] },
      hourly: { time: ["2026-04-16T15:00"] }
    });

    const app = createApp({
      searchPlaces: vi.fn(),
      getLocationData,
      reverseGeocode: vi.fn()
    });

    const response = await request(app).get("/api/location-data").query({ lat: 12.97, lon: 77.59, timezone: "auto" });
    expect(response.status).toBe(200);
    expect(response.body.location.timezone).toBe("Asia/Kolkata");
    expect(getLocationData).toHaveBeenCalledWith(12.97, 77.59, "auto");
  });
});
