import { describe, it, expect } from "vitest";
import { findAdjacentComment, isEditableTarget } from "./commentNav";

describe("findAdjacentComment", () => {
  // Flat entries with no reply chains -- every comment is its own root.
  const entries = [
    { id: "c1", rootId: "c1", top: -300 },
    { id: "c2", rootId: "c2", top: -50 },
    { id: "c3", rootId: "c3", top: 100 },
    { id: "c4", rootId: "c4", top: 400 },
  ];

  it("finds the next comment below the current viewport for direction 'next'", () => {
    expect(findAdjacentComment(entries, "next")).toBe("c3");
  });

  it("finds the nearest comment above the current viewport for direction 'previous'", () => {
    expect(findAdjacentComment(entries, "previous")).toBe("c2");
  });

  it("returns null with no wraparound when already at the last comment", () => {
    const atEnd = [{ id: "c1", rootId: "c1", top: -300 }, { id: "c2", rootId: "c2", top: -50 }];
    expect(findAdjacentComment(atEnd, "next")).toBeNull();
  });

  it("returns null with no wraparound when already at the first comment", () => {
    const atStart = [{ id: "c1", rootId: "c1", top: 100 }, { id: "c2", rootId: "c2", top: 400 }];
    expect(findAdjacentComment(atStart, "previous")).toBeNull();
  });

  it("does not re-match the current comment for 'next' when it's centered on screen", () => {
    // After navigating to c3, scrollIntoView({block: "center"}) leaves its
    // top well past the epsilon (it's not at the top of the viewport), so
    // without excluding currentId, "next" would match c3 again instead of
    // advancing to c4.
    const centered = [
      { id: "c1", rootId: "c1", top: -300 },
      { id: "c2", rootId: "c2", top: -50 },
      { id: "c3", rootId: "c3", top: 250 },
      { id: "c4", rootId: "c4", top: 400 },
    ];
    expect(findAdjacentComment(centered, "next", "c3")).toBe("c4");
  });

  it("does not re-match the current comment for 'previous' when it's centered on screen", () => {
    const centered = [
      { id: "c1", rootId: "c1", top: -300 },
      { id: "c2", rootId: "c2", top: -50 },
      { id: "c3", rootId: "c3", top: 250 },
      { id: "c4", rootId: "c4", top: 400 },
    ];
    expect(findAdjacentComment(centered, "previous", "c2")).toBe("c1");
  });

  describe("comment chains (thread roots + replies)", () => {
    // R1, R2 (with three replies), R3 -- document order, all as one chain
    // that's scrolled deep into R2's replies (as if reading a long thread).
    const chainEntries = [
      { id: "R1", rootId: "R1", top: -500 },
      { id: "R2", rootId: "R2", top: -400 },
      { id: "R2-reply-a", rootId: "R2", top: -350 },
      { id: "R2-reply-b", rootId: "R2", top: -300 },
      { id: "R2-reply-c", rootId: "R2", top: -50 },
      { id: "R3", rootId: "R3", top: 300 },
    ];

    it("only ever returns thread roots, never a reply", () => {
      expect(findAdjacentComment(chainEntries, "next", "R2")).toBe("R3");
      expect(findAdjacentComment(chainEntries, "previous", "R3")).toBe("R2");
    });

    it("previous never returns a reply's own chain root when already positioned deep in that chain", () => {
      // No currentId tracked yet (e.g. the user scrolled here manually, past
      // R2's replies, without using the shortcut) -- "previous" must skip
      // past R2 (the chain already being read) to R1, not just land back on
      // R2's own root.
      expect(findAdjacentComment(chainEntries, "previous")).toBe("R1");
    });

    it("next from deep within a chain (no currentId) still finds the next distinct chain", () => {
      expect(findAdjacentComment(chainEntries, "next")).toBe("R3");
    });

    it("does not exclude a chain's own root when the viewport is merely near it, not past its replies", () => {
      // Positioned just past R2's own root (top < epsilon) but none of its
      // replies -- this matches the plain flat-entries case: landing
      // directly on R2 for "previous" is still correct here.
      const nearRootOnly = [
        { id: "R1", rootId: "R1", top: -500 },
        { id: "R2", rootId: "R2", top: -50 },
        { id: "R2-reply-a", rootId: "R2", top: 200 },
        { id: "R3", rootId: "R3", top: 500 },
      ];
      expect(findAdjacentComment(nearRootOnly, "previous")).toBe("R2");
    });
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
