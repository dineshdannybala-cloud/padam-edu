import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { getLocationData, reverseGeocode, searchPlaces } from "./api";
import type { LocationData, Place } from "./types";
import DailyForecast from "./components/DailyForecast";
import HourlyForecast from "./components/HourlyForecast";

type MapMode = "streets" | "satellite";
type TimezoneMode = "location" | "user" | "utc" | "custom";

const STREET_STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri_satellite: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Esri"
    },
    esri_labels: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Esri"
    }
  },
  layers: [
    { id: "satellite", type: "raster", source: "esri_satellite" },
    { id: "labels", type: "raster", source: "esri_labels" }
  ]
};

function applyMapReadabilityTuning(map: MapLibreMap, mapMode: MapMode) {
  const style = map.getStyle();
  if (!style?.layers) {
    return;
  }

  for (const layer of style.layers) {
    if (layer.type !== "symbol") {
      continue;
    }

    const textField = (layer.layout as Record<string, unknown> | undefined)?.["text-field"];
    if (!textField) {
      continue;
    }

    try {
      map.setPaintProperty(layer.id, "text-halo-width", mapMode === "satellite" ? 2.2 : 1.3);
      map.setPaintProperty(layer.id, "text-halo-color", mapMode === "satellite" ? "#101316" : "#ffffff");

      const id = layer.id.toLowerCase();
      if (id.includes("poi") || id.includes("place") || id.includes("city")) {
        map.setLayoutProperty(layer.id, "text-size", ["interpolate", ["linear"], ["zoom"], 5, 11, 12, 15]);
      }
    } catch {
      // Some external style layers are immutable for a subset of properties.
    }
  }
}

const WEATHER_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Strong rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm"
};

function formatPlaceLabel(place: Place): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function getDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getHour24(date: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23"
    }).format(date)
  );
}

function formatHour(date: Date, timezone: string): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    timeZone: timezone
  });
}

function formatDayFromRaw(rawDay: string, timezone: string): string {
  const normalized = rawDay.includes("T") ? new Date(rawDay) : new Date(`${rawDay}T12:00:00Z`);
  return normalized.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone
  });
}

function formatTimeValue(value: string | number | null | undefined, timezone: string): string {
  if (typeof value !== "string") {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "numeric",
    timeZone: timezone
  });
}

function formatMetric(value: string | number | null | undefined, unit: string): string {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)} ${unit}` : "N/A";
}

function getWeatherLabelFromCode(code: number): string {
  if (!Number.isFinite(code)) {
    return "Unknown";
  }
  return WEATHER_CODE_MAP[code] ?? `Code ${code}`;
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("streets");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedHourKey, setSelectedHourKey] = useState<string | null>(null);
  const [timezoneMode, setTimezoneMode] = useState<TimezoneMode>("location");
  const [customTimezoneInput, setCustomTimezoneInput] = useState("");
  const [customTimezoneApplied, setCustomTimezoneApplied] = useState("");
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

  const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STREET_STYLE_URL,
      center: [77.5946, 12.9716],
      zoom: 2.2
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("styledata", () => {
      applyMapReadabilityTuning(map, "streets");
    });

    map.on("click", async (event) => {
      try {
        const resolved = await reverseGeocode(event.lngLat.lat, event.lngLat.lng);
        const placeFromMap: Place = resolved ?? {
          id: Date.now(),
          name: "Pinned Location",
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng
        };

        await selectPlace(placeFromMap, false);
      } catch {
        const fallback: Place = {
          id: Date.now(),
          name: "Pinned Location",
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng
        };
        await selectPlace(fallback, false);
      }
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const style: string | StyleSpecification = mapMode === "streets" ? STREET_STYLE_URL : (SATELLITE_STYLE as StyleSpecification);
    map.once("styledata", () => applyMapReadabilityTuning(map, mapMode));
    map.setStyle(style);
  }, [mapMode]);

  useEffect(() => {
    const trimmed = search.trim();

    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = globalThis.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const places = await searchPlaces(trimmed);
        setResults(places);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        setError(message);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => globalThis.clearTimeout(timer);
  }, [search]);

  const locationTimezone = locationData?.location.timezone ?? "UTC";
  const effectiveTimezone = useMemo(() => {
    if (timezoneMode === "location") {
      return locationTimezone;
    }
    if (timezoneMode === "user") {
      return userTimezone;
    }
    if (timezoneMode === "utc") {
      return "UTC";
    }
    return isValidTimezone(customTimezoneApplied) ? customTimezoneApplied : locationTimezone;
  }, [customTimezoneApplied, locationTimezone, timezoneMode, userTimezone]);

  async function selectPlace(place: Place, flyTo = true) {
    setSelectedPlace(place);
    setError(null);
    setDataLoading(true);

    try {
      const data = await getLocationData(place.latitude, place.longitude, place.timezone ?? "auto");
      setLocationData(data);
      setSelectedDayIndex(0);
      setSelectedHourKey(null);
      setTimezoneMode("location");
      setTimezoneError(null);

      const map = mapRef.current;
      if (map) {
        if (flyTo) {
          map.flyTo({ center: [place.longitude, place.latitude], zoom: 8, speed: 0.8 });
        }

        markerRef.current?.remove();
        markerRef.current = new maplibregl.Marker({ color: "#dd3f0c" })
          .setLngLat([place.longitude, place.latitude])
          .addTo(map);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load location data";
      setError(message);
      setLocationData(null);
    } finally {
      setDataLoading(false);
    }
  }

  const daily = locationData?.daily ?? {};
  const current = locationData?.current ?? {};
  const hourly = locationData?.hourly ?? {};

  const dailyTimes = (daily.time as string[] | undefined) ?? [];

  const dailyItems = useMemo(() => {
    const weatherCodes = daily.weather_code as Array<string | number | null> | undefined;
    const sunriseSeries = daily.sunrise as Array<string | number | null> | undefined;
    const sunsetSeries = daily.sunset as Array<string | number | null> | undefined;

    return dailyTimes.slice(0, 10).map((rawDay, index) => {
      const code = Number(weatherCodes?.[index] ?? Number.NaN);
      const label =
        index === 0 ? "Today" : index === 1 ? "Tomorrow" : formatDayFromRaw(rawDay, effectiveTimezone);

      const sunrise = formatTimeValue(sunriseSeries?.[index], effectiveTimezone);
      const sunset = formatTimeValue(sunsetSeries?.[index], effectiveTimezone);

      return {
        key: `${rawDay}-${index}`,
        rawDay,
        index,
        label,
        sunLabel: `${sunrise} / ${sunset}`,
        weatherCode: Number.isFinite(code) ? code : -1
      };
    });
  }, [daily.sunrise, daily.sunset, daily.weather_code, dailyTimes, effectiveTimezone]);

  useEffect(() => {
    if (dailyItems.length === 0) {
      return;
    }
    if (selectedDayIndex >= dailyItems.length) {
      setSelectedDayIndex(0);
    }
  }, [dailyItems.length, selectedDayIndex]);

  const selectedDayRaw = dailyItems[selectedDayIndex]?.rawDay;
  const selectedDayKey = selectedDayRaw
    ? getDayKey(
        selectedDayRaw.includes("T") ? new Date(selectedDayRaw) : new Date(`${selectedDayRaw}T12:00:00Z`),
        effectiveTimezone
      )
    : null;

  const hourlyItems = useMemo(() => {
    if (!selectedDayRaw || !selectedDayKey) {
      return [] as Array<{
        key: string;
        label: string;
        temperature: string;
        weatherCode: number;
        index: number;
      }>;
    }

    const times = (hourly.time as string[] | undefined) ?? [];
    const temperatures = hourly.temperature_2m as Array<string | number | null> | undefined;
    const weatherCodes = hourly.weather_code as Array<string | number | null> | undefined;

    const now = new Date();
    const todayKey = getDayKey(now, effectiveTimezone);
    const currentHour = getHour24(now, effectiveTimezone);
    const isTodaySelected = selectedDayKey === todayKey;

    const filtered = times
      .map((rawTime, index) => {
        const date = new Date(rawTime);
        if (Number.isNaN(date.getTime())) {
          return null;
        }

        const matchesDay =
          timezoneMode === "location" && /^\d{4}-\d{2}-\d{2}$/.test(selectedDayRaw)
            ? rawTime.startsWith(selectedDayRaw)
            : getDayKey(date, effectiveTimezone) === selectedDayKey;

        if (!matchesDay) {
          return null;
        }

        if (isTodaySelected && getHour24(date, effectiveTimezone) < currentHour) {
          return null;
        }

        const code = Number(weatherCodes?.[index] ?? Number.NaN);
        const temp = Number(temperatures?.[index] ?? Number.NaN);

        return {
          key: rawTime,
          rawTime,
          index,
          weatherCode: Number.isFinite(code) ? code : -1,
          temperature: Number.isFinite(temp) ? `${Math.round(temp)}°C` : "--"
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .slice(0, 24)
      .map((entry, index) => ({
        ...entry,
        label: isTodaySelected && index === 0 ? "Now" : formatHour(new Date(entry.rawTime), effectiveTimezone)
      }));

    return filtered;
  }, [effectiveTimezone, hourly.temperature_2m, hourly.time, hourly.weather_code, selectedDayKey, selectedDayRaw, timezoneMode]);

  useEffect(() => {
    if (hourlyItems.length === 0) {
      setSelectedHourKey(null);
      return;
    }

    if (!selectedHourKey || !hourlyItems.some((item) => item.key === selectedHourKey)) {
      setSelectedHourKey(hourlyItems[0].key);
    }
  }, [hourlyItems, selectedHourKey]);

  const selectedHourlyItem = hourlyItems.find((item) => item.key === selectedHourKey) ?? null;
  const selectedHourlyIndex = selectedHourlyItem?.index;

  const selectedWeatherCode =
    selectedHourlyIndex !== undefined
      ? Number((hourly.weather_code as Array<string | number | null> | undefined)?.[selectedHourlyIndex] ?? Number.NaN)
      : Number(current.weather_code ?? Number.NaN);

  const weatherLabel = getWeatherLabelFromCode(selectedWeatherCode);

  const selectedTemperature =
    selectedHourlyIndex !== undefined
      ? formatMetric((hourly.temperature_2m as Array<string | number | null> | undefined)?.[selectedHourlyIndex], "°C")
      : formatMetric(current.temperature_2m, "°C");

  const selectedFeelsLike =
    selectedHourlyIndex !== undefined
      ? formatMetric((hourly.apparent_temperature as Array<string | number | null> | undefined)?.[selectedHourlyIndex], "°C")
      : formatMetric(current.apparent_temperature, "°C");

  const selectedPrecip =
    selectedHourlyIndex !== undefined
      ? formatMetric(
          (hourly.precipitation_probability as Array<string | number | null> | undefined)?.[selectedHourlyIndex],
          "%"
        )
      : formatMetric(current.precipitation, "mm");

  const selectedWind =
    selectedHourlyIndex !== undefined
      ? formatMetric((hourly.wind_speed_10m as Array<string | number | null> | undefined)?.[selectedHourlyIndex], "km/h")
      : formatMetric(current.wind_speed_10m, "km/h");

  const selectedWindDirection =
    selectedHourlyIndex !== undefined
      ? formatMetric(
          (hourly.wind_direction_10m as Array<string | number | null> | undefined)?.[selectedHourlyIndex],
          "deg"
        )
      : formatMetric(current.wind_direction_10m, "deg");

  const selectedSunrise = formatTimeValue((daily.sunrise as Array<string | number | null> | undefined)?.[selectedDayIndex], effectiveTimezone);
  const selectedSunset = formatTimeValue((daily.sunset as Array<string | number | null> | undefined)?.[selectedDayIndex], effectiveTimezone);
  const selectedMoonrise = formatTimeValue((daily.moonrise as Array<string | number | null> | undefined)?.[selectedDayIndex], effectiveTimezone);
  const selectedMoonset = formatTimeValue((daily.moonset as Array<string | number | null> | undefined)?.[selectedDayIndex], effectiveTimezone);

  const selectedSlotLabel = selectedHourlyItem?.label ?? "Now";

  function applyCustomTimezone() {
    const trimmed = customTimezoneInput.trim();
    if (!trimmed) {
      setTimezoneError("Enter a timezone like Asia/Kolkata.");
      return;
    }
    if (!isValidTimezone(trimmed)) {
      setTimezoneError("Invalid timezone. Try a value like Europe/Berlin or America/New_York.");
      return;
    }

    setCustomTimezoneApplied(trimmed);
    setTimezoneMode("custom");
    setTimezoneError(null);
  }

  return (
    <div className="layout">
      <aside className="panel">
        <h1>Photo Assist</h1>
        <p className="subtitle">Find perfect light with real-time weather and astronomy context.</p>

        <div className="timezoneCard">
          <label htmlFor="timezoneMode" className="timezoneLabel">
            Timezone
          </label>
          <select
            id="timezoneMode"
            className="timezoneSelect"
            value={timezoneMode}
            onChange={(event) => {
              setTimezoneMode(event.target.value as TimezoneMode);
              setTimezoneError(null);
            }}
          >
            <option value="location">Location ({locationTimezone})</option>
            <option value="user">Your Local ({userTimezone})</option>
            <option value="utc">UTC</option>
            <option value="custom">Custom</option>
          </select>

          <div className="timezoneCustomRow">
            <input
              type="text"
              value={customTimezoneInput}
              onChange={(event) => setCustomTimezoneInput(event.target.value)}
              placeholder="e.g. Asia/Kolkata"
              className="timezoneInput"
              aria-label="Custom timezone"
            />
            <button type="button" className="timezoneApplyBtn" onClick={applyCustomTimezone}>
              Apply
            </button>
          </div>

          {timezoneMode === "custom" && customTimezoneApplied && (
            <div className="hint">Using: {effectiveTimezone}</div>
          )}
          {timezoneError && <p className="error">{timezoneError}</p>}
        </div>

        <fieldset className="mapModeGroup" aria-label="Map style">
          <legend className="mapModeLegend">Map Type</legend>
          <button
            type="button"
            className={mapMode === "streets" ? "modeBtn active" : "modeBtn"}
            onClick={() => setMapMode("streets")}
          >
            Streets
          </button>
          <button
            type="button"
            className={mapMode === "satellite" ? "modeBtn active" : "modeBtn"}
            onClick={() => setMapMode("satellite")}
          >
            Satellite
          </button>
        </fieldset>

        <div className="searchBox">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search places..."
            aria-label="Search places"
          />
          {searchLoading && <div className="hint">Searching...</div>}

          {results.length > 0 && (
            <ul className="resultsList">
              {results.map((place) => (
                <li key={place.id}>
                  <button type="button" onClick={() => void selectPlace(place)}>
                    {formatPlaceLabel(place)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <section className="card">
          <h2>{selectedPlace ? formatPlaceLabel(selectedPlace) : "Pick a location"}</h2>
          {!locationData && <p className="muted">Click the map or search for a place to load details.</p>}

          {dataLoading && <p className="hint">Loading weather and astro data...</p>}

          {locationData && !dataLoading && (
            <>
              <div className="dataGrid">
                <div>
                  <strong>Selected Slot:</strong> {selectedSlotLabel}
                </div>
                <div>
                  <strong>Weather:</strong> {weatherLabel}
                </div>
                <div>
                  <strong>Temp:</strong> {selectedTemperature}
                </div>
                <div>
                  <strong>Feels Like:</strong> {selectedFeelsLike}
                </div>
                <div>
                  <strong>Precipitation:</strong> {selectedPrecip}
                </div>
                <div>
                  <strong>Wind:</strong> {selectedWind}
                </div>
                <div>
                  <strong>Wind Direction:</strong> {selectedWindDirection}
                </div>
                <div>
                  <strong>Humidity:</strong> {formatMetric(current.relative_humidity_2m, "%")}
                </div>
                <div>
                  <strong>Cloud Total:</strong> {formatMetric(current.cloud_cover, "%")}
                </div>
                <div>
                  <strong>Cloud Low:</strong> {formatMetric(current.cloud_cover_low, "%")}
                </div>
                <div>
                  <strong>Cloud Mid:</strong> {formatMetric(current.cloud_cover_mid, "%")}
                </div>
                <div>
                  <strong>Cloud High:</strong> {formatMetric(current.cloud_cover_high, "%")}
                </div>
                <div><strong>Sunrise:</strong> {selectedSunrise}</div>
                <div><strong>Sunset:</strong> {selectedSunset}</div>
                <div><strong>Moonrise:</strong> {selectedMoonrise}</div>
                <div><strong>Moonset:</strong> {selectedMoonset}</div>
              </div>
              <HourlyForecast items={hourlyItems} selectedKey={selectedHourKey} onSelect={setSelectedHourKey} />
              <DailyForecast
                items={dailyItems}
                selectedKey={dailyItems[selectedDayIndex]?.key ?? null}
                onSelect={(key) => {
                  const index = dailyItems.findIndex((item) => item.key === key);
                  if (index >= 0) {
                    setSelectedDayIndex(index);
                    setSelectedHourKey(null);
                  }
                }}
              />
            </>
          )}
        </section>
      </aside>

      <main ref={mapContainerRef} className="mapContainer" />
    </div>
  );
}
