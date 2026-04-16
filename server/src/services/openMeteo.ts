import type { LocationDataResponse, SearchResult } from "../types.js";

const SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MET_MOON_URL = "https://api.met.no/weatherapi/sunrise/3.0/moon";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "weather_code",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "surface_pressure"
].join(",");

const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "weather_code",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_direction_10m"
].join(",");

const DAILY_FIELDS = [
  "weather_code",
  "sunrise",
  "sunset",
  "uv_index_max",
  "precipitation_probability_max"
].join(",");

function getDateForTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function getUtcOffsetForTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset"
    });

    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value;

    if (!offsetPart) {
      return "+00:00";
    }

    const cleaned = offsetPart.replace("GMT", "").replace("UTC", "").trim();
    if (cleaned === "") {
      return "+00:00";
    }

    const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(cleaned);
    if (!match) {
      return "+00:00";
    }

    const sign = match[1];
    const hour = match[2].padStart(2, "0");
    const minute = (match[3] ?? "00").padStart(2, "0");
    return `${sign}${hour}:${minute}`;
  } catch {
    return "+00:00";
  }
}

async function getMoonData(latitude: number, longitude: number, timezone: string) {
  const moonUrl = new URL(MET_MOON_URL);
  moonUrl.searchParams.set("lat", latitude.toString());
  moonUrl.searchParams.set("lon", longitude.toString());
  moonUrl.searchParams.set("date", getDateForTimezone(timezone));
  moonUrl.searchParams.set("offset", getUtcOffsetForTimezone(timezone));

  const response = await fetch(moonUrl, {
    headers: {
      // MET API requires a custom user agent string.
      "User-Agent": "photo-assist-app/1.0 github-copilot"
    }
  });

  if (!response.ok) {
    throw new Error(`Moon API failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    properties?: {
      moonrise?: { time?: string };
      moonset?: { time?: string };
    };
  };

  return {
    moonrise: data.properties?.moonrise?.time ?? null,
    moonset: data.properties?.moonset?.time ?? null
  };
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search API failed with status ${response.status}`);
  }

  const data = (await response.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<SearchResult | null> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", latitude.toString());
  url.searchParams.set("lon", longitude.toString());
  url.searchParams.set("zoom", "12");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      // Nominatim usage policy requires identification via User-Agent.
      "User-Agent": "photo-assist-app/1.0 github-copilot"
    }
  });

  if (!response.ok) {
    throw new Error(`Reverse geocode API failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    place_id?: number;
    lat?: string;
    lon?: string;
    name?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
  };

  const lat = Number(data.lat);
  const lon = Number(data.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    id: data.place_id ?? Date.now(),
    name: data.name ?? data.address?.city ?? data.address?.town ?? data.address?.village ?? "Pinned Location",
    latitude: lat,
    longitude: lon,
    admin1: data.address?.state,
    country: data.address?.country,
    country_code: data.address?.country_code?.toUpperCase()
  };
}

export async function getLocationData(
  latitude: number,
  longitude: number,
  timezone = "auto"
): Promise<LocationDataResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: CURRENT_FIELDS,
    daily: DAILY_FIELDS,
    hourly: HOURLY_FIELDS,
    forecast_days: "10",
    timezone: "auto"
  });

  const forecastResponse = await fetch(`${FORECAST_URL}?${params.toString()}`);

  if (!forecastResponse.ok) {
    throw new Error(`Forecast API failed with status ${forecastResponse.status}`);
  }

  const data = (await forecastResponse.json()) as Record<string, unknown>;
  const resolvedTimezone = (data.timezone as string) ?? timezone;

  const daily = (data.daily as Record<string, Array<string | number | null>>) ?? {};
  const hourly = (data.hourly as Record<string, Array<string | number | null>>) ?? {};

  try {
    const moon = await getMoonData(latitude, longitude, resolvedTimezone);
    daily.moonrise = [moon.moonrise];
    daily.moonset = [moon.moonset];
  } catch {
    daily.moonrise = [null];
    daily.moonset = [null];
  }

  return {
    location: {
      latitude,
      longitude,
      timezone: resolvedTimezone
    },
    current: (data.current as Record<string, number | string | null>) ?? {},
    daily,
    hourly
  };
}
