import { describe, expect, it } from "vitest";
import { getQueryString } from "./query.js";

describe("getQueryString", () => {
  it("returns string query value", () => {
    expect(getQueryString("abc", "x")).toBe("abc");
  });

  it("falls back for non-string values", () => {
    expect(getQueryString(10, "fallback")).toBe("fallback");
    expect(getQueryString(undefined, "fallback")).toBe("fallback");
  });
});
