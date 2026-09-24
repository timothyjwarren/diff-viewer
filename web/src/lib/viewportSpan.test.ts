import { describe, it, expect } from "vitest";
import { computeViewportSpan } from "./viewportSpan";

// Rects are relative to the scroll viewport's top edge; viewport is 500px tall.
const H = 500;

describe("computeViewportSpan", () => {
  it("returns null when there are no files", () => {
    expect(computeViewportSpan([], H)).toBeNull();
  });

  it("covers just the one file when it fills the viewport", () => {
    const span = computeViewportSpan([{ id: "a", top: -500, bottom: 1500 }], H);
    expect(span).toEqual({ startId: "a", endId: "a" });
  });

  it("stretches across the tail of one file and the head of the next", () => {
    const span = computeViewportSpan([
      { id: "a", top: -800, bottom: 200 },
      { id: "b", top: 216, bottom: 1216 },
    ], H);
    expect(span).toEqual({ startId: "a", endId: "b" });
  });

  it("drops a file once its tail has scrolled off the top", () => {
    const span = computeViewportSpan([
      { id: "a", top: -1000, bottom: -10 },
      { id: "b", top: 6, bottom: 1006 },
    ], H);
    expect(span).toEqual({ startId: "b", endId: "b" });
  });

  it("covers every file that is entirely on screen", () => {
    const span = computeViewportSpan([
      { id: "a", top: 0, bottom: 100 },
      { id: "b", top: 116, bottom: 200 },
      { id: "c", top: 216, bottom: 300 },
      { id: "d", top: 600, bottom: 700 },
    ], H);
    expect(span).toEqual({ startId: "a", endId: "c" });
  });

  it("returns null when no file is on screen", () => {
    expect(computeViewportSpan([{ id: "a", top: 600, bottom: 900 }], H)).toBeNull();
  });
});
