import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeatherIcon from "./WeatherIcon";

describe("WeatherIcon", () => {
  it("renders expected icon for known weather code", () => {
    render(<WeatherIcon code={0} />);
    expect(screen.getByText("☀️")).toBeInTheDocument();
  });

  it("renders fallback icon for unknown weather code", () => {
    render(<WeatherIcon code={999} />);
    expect(screen.getByText("🤷‍♀️")).toBeInTheDocument();
  });
});
