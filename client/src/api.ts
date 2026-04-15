import type { LocationData, Place } from "./types";

const API_BASE = "http://localhost:8080/api";

export async function searchPlaces(query: string): Promise<Place[]> {
  const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }
  const data = (await response.json()) as { results: Place[] };
  return data.results;
}

export async function getLocationData(lat: number, lon: number, timezone = "auto"): Promise<LocationData> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    timezone
  });

  const response = await fetch(`${API_BASE}/location-data?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Location data failed with status ${response.status}`);
  }
  return (await response.json()) as LocationData;
}

export async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon)
  });

  const response = await fetch(`${API_BASE}/reverse-geocode?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Reverse geocode failed with status ${response.status}`);
  }

  const data = (await response.json()) as { result: Place | null };
  return data.result;
}
