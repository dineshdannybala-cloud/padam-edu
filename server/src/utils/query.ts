export function getQueryString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
