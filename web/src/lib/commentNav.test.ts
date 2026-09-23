import { describe, it, expect } from "vitest";
import { findAdjacentComment } from "./commentNav";

describe("findAdjacentComment", () => {
  const entries = [
    { id: "c1", top: -300 },
    { id: "c2", top: -50 },
    { id: "c3", top: 100 },
    { id: "c4", top: 400 },
  ];

  it("finds the next comment below the current viewport for direction 'next'", () => {
    expect(findAdjacentComment(entries, "next")).toBe("c3");
  });

  it("finds the nearest comment above the current viewport for direction 'previous'", () => {
    expect(findAdjacentComment(entries, "previous")).toBe("c2");
  });

  it("returns null with no wraparound when already at the last comment", () => {
    const atEnd = [{ id: "c1", top: -300 }, { id: "c2", top: -50 }];
    expect(findAdjacentComment(atEnd, "next")).toBeNull();
  });

  it("returns null with no wraparound when already at the first comment", () => {
    const atStart = [{ id: "c1", top: 100 }, { id: "c2", top: 400 }];
    expect(findAdjacentComment(atStart, "previous")).toBeNull();
  });
});
