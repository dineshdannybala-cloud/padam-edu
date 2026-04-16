import WeatherIcon from "./WeatherIcon";

type DailyForecastItem = {
  key: string;
  label: string;
  sunLabel: string;
  weatherCode: number;
};

type Props = {
  items: DailyForecastItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export default function DailyForecast({ items, selectedKey, onSelect }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="forecast-daily">
      <h2>Daily Forecast</h2>
      <div className="forecast-daily-items">
        {items.map((item) => {
          const isSelected = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={isSelected ? "forecast-daily-item active" : "forecast-daily-item"}
              onClick={() => onSelect(item.key)}
            >
              <div className="forecast-daily-item-date">
                {item.label}
              </div>
              <WeatherIcon code={item.weatherCode} className="forecast-daily-item-icon" />
              <div className="forecast-daily-item-sun">
                {item.sunLabel}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
