import { describe, it, expect } from "vitest";
import { pickActiveEntry } from "./scrollSpy";

describe("pickActiveEntry", () => {
  it("returns null when nothing is intersecting", () => {
    expect(pickActiveEntry([{ id: "a", top: 100, isIntersecting: false }])).toBeNull();
  });

  it("picks the entry whose top is closest to, but not past, the top of the viewport", () => {
    const entries = [
      { id: "a", top: -300, isIntersecting: true },
      { id: "b", top: -10, isIntersecting: true },
      { id: "c", top: 200, isIntersecting: true },
    ];
    expect(pickActiveEntry(entries)).toBe("b");
  });

  it("falls back to the entry nearest the top when all intersecting entries are below it", () => {
    const entries = [
      { id: "a", top: 50, isIntersecting: true },
      { id: "b", top: 200, isIntersecting: true },
    ];
    expect(pickActiveEntry(entries)).toBe("a");
  });

  it("ignores non-intersecting entries when picking among intersecting ones", () => {
    const entries = [
      { id: "a", top: -5, isIntersecting: false },
      { id: "b", top: 100, isIntersecting: true },
    ];
    expect(pickActiveEntry(entries)).toBe("b");
  });
});
