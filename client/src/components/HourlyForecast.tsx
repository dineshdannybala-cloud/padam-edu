import WeatherIcon from "./WeatherIcon";

type HourlyForecastItem = {
  key: string;
  label: string;
  temperature: string;
  weatherCode: number;
};

type Props = {
  items: HourlyForecastItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export default function HourlyForecast({ items, selectedKey, onSelect }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="forecast-hourly">
      <h2>Hourly Forecast</h2>
      <div className="forecast-hourly-items">
        {items.map((item) => {
          const isSelected = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={isSelected ? "forecast-hourly-item active" : "forecast-hourly-item"}
              onClick={() => onSelect(item.key)}
            >
              <div className="forecast-hourly-item-time">{item.label}</div>
              <WeatherIcon code={item.weatherCode} className="forecast-hourly-item-icon" />
              <div className="forecast-hourly-item-temp">{item.temperature}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
