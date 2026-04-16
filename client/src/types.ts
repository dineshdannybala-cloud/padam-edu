export type Place = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
};

export type LocationData = {
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  current: Record<string, number | string | null>;
  daily: Record<string, Array<string | number | null>>;
  hourly: Record<string, Array<string | number | null>>;
};
