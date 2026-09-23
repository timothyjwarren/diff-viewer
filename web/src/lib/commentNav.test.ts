import { describe, it, expect } from "vitest";
import { findAdjacentComment, isEditableTarget } from "./commentNav";

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

  it("does not re-match the current comment for 'next' when it's centered on screen", () => {
    // After navigating to c3, scrollIntoView({block: "center"}) leaves its
    // top well past the epsilon (it's not at the top of the viewport), so
    // without excluding currentId, "next" would match c3 again instead of
    // advancing to c4.
    const centered = [
      { id: "c1", top: -300 },
      { id: "c2", top: -50 },
      { id: "c3", top: 250 },
      { id: "c4", top: 400 },
    ];
    expect(findAdjacentComment(centered, "next", "c3")).toBe("c4");
  });

  it("does not re-match the current comment for 'previous' when it's centered on screen", () => {
    const centered = [
      { id: "c1", top: -300 },
      { id: "c2", top: -50 },
      { id: "c3", top: 250 },
      { id: "c4", top: 400 },
    ];
    expect(findAdjacentComment(centered, "previous", "c2")).toBe("c1");
  });
});

describe("isEditableTarget", () => {
  it("returns true for a textarea", () => {
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
  });

  it("returns true for a text input", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
  });

  it("returns false for a non-editable element", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
