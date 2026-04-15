export type SearchResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  admin1?: string;
  country?: string;
  timezone?: string;
};

export type LocationDataResponse = {
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  current: Record<string, number | string | null>;
  daily: Record<string, Array<string | number | null>>;
};
