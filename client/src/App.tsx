import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { getLocationData, reverseGeocode, searchPlaces } from "./api";
import type { LocationData, Place } from "./types";

type MapMode = "streets" | "satellite";

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

  const weatherLabel = useMemo(() => {
    const code = Number(locationData?.current?.weather_code ?? Number.NaN);
    if (!Number.isFinite(code)) {
      return "Unknown";
    }
    return WEATHER_CODE_MAP[code] ?? `Code ${code}`;
  }, [locationData]);

  async function selectPlace(place: Place, flyTo = true) {
    setSelectedPlace(place);
    setError(null);
    setDataLoading(true);

    try {
      const data = await getLocationData(place.latitude, place.longitude, place.timezone ?? "auto");
      setLocationData(data);

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

  return (
    <div className="layout">
      <aside className="panel">
        <h1>Photo Assist</h1>
        <p className="subtitle">Find perfect light with real-time weather and astronomy context.</p>

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
            <div className="dataGrid">
              <div><strong>Weather:</strong> {weatherLabel}</div>
              <div><strong>Temp:</strong> {current.temperature_2m} °C</div>
              <div><strong>Feels Like:</strong> {current.apparent_temperature} °C</div>
              <div><strong>Humidity:</strong> {current.relative_humidity_2m} %</div>
              <div><strong>Wind:</strong> {current.wind_speed_10m} km/h</div>
              <div><strong>Wind Direction:</strong> {current.wind_direction_10m} deg</div>
              <div><strong>Cloud Total:</strong> {current.cloud_cover} %</div>
              <div><strong>Cloud Low:</strong> {current.cloud_cover_low} %</div>
              <div><strong>Cloud Mid:</strong> {current.cloud_cover_mid} %</div>
              <div><strong>Cloud High:</strong> {current.cloud_cover_high} %</div>
              <div><strong>Sunrise:</strong> {String(daily.sunrise?.[0] ?? "N/A")}</div>
              <div><strong>Sunset:</strong> {String(daily.sunset?.[0] ?? "N/A")}</div>
              <div><strong>Moonrise:</strong> {String(daily.moonrise?.[0] ?? "N/A")}</div>
              <div><strong>Moonset:</strong> {String(daily.moonset?.[0] ?? "N/A")}</div>
            </div>
          )}
        </section>
      </aside>

      <main className="mapWrapper">
        <div className="map" ref={mapContainerRef} />
      </main>
    </div>
  );
}
