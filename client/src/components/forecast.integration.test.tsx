import { useMemo, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import DailyForecast from "./DailyForecast";
import HourlyForecast from "./HourlyForecast";

function ForecastHarness() {
  const [selectedDay, setSelectedDay] = useState("today");
  const [selectedHour, setSelectedHour] = useState<string | null>(null);

  const dailyItems = [
    { key: "today", label: "Today", sunLabel: "6:00 AM / 6:15 PM", weatherCode: 1 },
    { key: "tomorrow", label: "Tomorrow", sunLabel: "6:01 AM / 6:16 PM", weatherCode: 2 }
  ];

  const hourlyItems = useMemo(() => {
    if (selectedDay === "today") {
      return [
        { key: "t-now", label: "Now", temperature: "30°C", weatherCode: 1 },
        { key: "t-4pm", label: "4 PM", temperature: "31°C", weatherCode: 2 }
      ];
    }

    return [
      { key: "tm-9am", label: "9 AM", temperature: "28°C", weatherCode: 3 },
      { key: "tm-12pm", label: "12 PM", temperature: "32°C", weatherCode: 1 }
    ];
  }, [selectedDay]);

  const activeHour = hourlyItems.find((item) => item.key === selectedHour) ?? hourlyItems[0];

  return (
    <div>
      <div data-testid="selected-summary">{`${selectedDay}:${activeHour.label}:${activeHour.temperature}`}</div>
      <DailyForecast
        items={dailyItems}
        selectedKey={selectedDay}
        onSelect={(key) => {
          setSelectedDay(key);
          setSelectedHour(null);
        }}
      />
      <HourlyForecast items={hourlyItems} selectedKey={selectedHour} onSelect={setSelectedHour} />
    </div>
  );
}

describe("forecast integration", () => {
  it("switches day and updates hour-driven summary", async () => {
    const user = userEvent.setup();
    render(<ForecastHarness />);

    expect(screen.getByTestId("selected-summary")).toHaveTextContent("today:Now:30°C");

    await user.click(screen.getByRole("button", { name: /tomorrow/i }));
    expect(screen.getByTestId("selected-summary")).toHaveTextContent("tomorrow:9 AM:28°C");

    await user.click(screen.getByRole("button", { name: /12 PM/i }));
    expect(screen.getByTestId("selected-summary")).toHaveTextContent("tomorrow:12 PM:32°C");
  });
});
