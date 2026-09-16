import { describe, it, expect } from "vitest";
import { timeAgo } from "./timeAgo";

const NOW = new Date("2026-01-01T12:00:00Z");

describe("timeAgo", () => {
  it("shows 'just now' for sub-minute differences", () => {
    expect(timeAgo("2026-01-01T11:59:45Z", NOW)).toBe("just now");
  });

  it("shows minutes for sub-hour differences", () => {
    expect(timeAgo("2026-01-01T11:45:00Z", NOW)).toBe("15m ago");
  });

  it("shows hours for sub-day differences", () => {
    expect(timeAgo("2026-01-01T09:00:00Z", NOW)).toBe("3h ago");
  });

  it("shows days for sub-month differences", () => {
    expect(timeAgo("2025-12-30T12:00:00Z", NOW)).toBe("2d ago");
  });
});
