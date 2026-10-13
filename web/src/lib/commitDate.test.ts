import { describe, it, expect } from "vitest";
import { commitDateLabel, commitDateTitle, dayHeading, dayKey } from "./commitDate";

/** A local-time moment as an ISO string, so expectations don't depend on the machine's timezone. */
function local(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

const NOW = new Date(2026, 9, 13, 15, 0); // Tue Oct 13 2026, 15:00 local

describe("commitDateLabel", () => {
  it("shows relative time for recent commits", () => {
    expect(commitDateLabel(local(2026, 10, 13, 12), NOW)).toBe("3h ago");
    expect(commitDateLabel(local(2026, 10, 11, 15), NOW)).toBe("2d ago");
  });

  it("shows a short absolute date once a commit is a month old or more", () => {
    expect(commitDateLabel(local(2026, 8, 20), NOW)).toBe("Aug 20");
    expect(commitDateLabel(local(2026, 9, 16), NOW)).toBe("27d ago");
  });

  it("includes the year for commits from a previous year", () => {
    expect(commitDateLabel(local(2025, 3, 2), NOW)).toBe("Mar 2, 2025");
  });

  it("is empty for the uncommitted row, which has no date", () => {
    expect(commitDateLabel("", NOW)).toBe("");
  });
});

describe("commitDateTitle", () => {
  it("gives the full local date and time", () => {
    expect(commitDateTitle(local(2026, 10, 13, 9, 5))).toMatch(/Oct(ober)? 13, 2026/);
    expect(commitDateTitle(local(2026, 10, 13, 9, 5))).toMatch(/9:05/);
  });

  it("is empty when there is no date", () => {
    expect(commitDateTitle("")).toBe("");
  });
});

describe("dayKey", () => {
  it("is the same for any time on the same local day and differs across days", () => {
    expect(dayKey(local(2026, 10, 13, 0, 1))).toBe(dayKey(local(2026, 10, 13, 23, 59)));
    expect(dayKey(local(2026, 10, 13))).not.toBe(dayKey(local(2026, 10, 12)));
  });

  it("is empty when there is no date", () => {
    expect(dayKey("")).toBe("");
  });
});

describe("dayHeading", () => {
  it("names today and yesterday", () => {
    expect(dayHeading(local(2026, 10, 13, 1), NOW)).toBe("Today");
    expect(dayHeading(local(2026, 10, 12, 23), NOW)).toBe("Yesterday");
  });

  it("gives weekday and date for earlier days this year", () => {
    expect(dayHeading(local(2026, 10, 9), NOW)).toBe("Fri, Oct 9");
  });

  it("includes the year for a previous year", () => {
    expect(dayHeading(local(2025, 12, 31), NOW)).toBe("Wed, Dec 31, 2025");
  });
});
