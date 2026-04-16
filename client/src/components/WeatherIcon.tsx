import type { CSSProperties } from "react";

const WEATHER_ICON_MAP: Record<number, string> = {
  0: "☀️",
  1: "☀️",
  2: "⛅️",
  3: "☁️",
  45: "🌫",
  48: "🌫",
  51: "🌧",
  53: "🌧",
  55: "🌧",
  61: "🌧",
  63: "🌧",
  65: "🌧",
  71: "🌨",
  73: "🌨",
  75: "🌨",
  80: "🌦",
  81: "🌦",
  82: "⛈",
  95: "⛈"
};

type Props = {
  code: number;
  style?: CSSProperties;
  className?: string;
};

export default function WeatherIcon({ code, ...props }: Props) {
  return <div {...props}>{WEATHER_ICON_MAP[code] ?? "🤷‍♀️"}</div>;
}
