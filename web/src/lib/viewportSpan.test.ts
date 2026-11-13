import { describe, it, expect } from "vitest";
import { computeViewportSpan, scrollTopToReveal } from "./viewportSpan";

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

describe("scrollTopToReveal", () => {
  // Sidebar is 400px tall, scrolled to 1000; margin 32.
  it("leaves the sidebar alone when the rows are already on screen", () => {
    expect(scrollTopToReveal(1100, 1200, 1000, 400)).toBeNull();
  });

  it("scrolls up just enough to show rows above the view", () => {
    expect(scrollTopToReveal(900, 950, 1000, 400)).toBe(868);
  });

  it("scrolls down just enough to show rows below the view", () => {
    expect(scrollTopToReveal(1500, 1550, 1000, 400)).toBe(1182);
  });

  it("shows the top of rows taller than the view", () => {
    expect(scrollTopToReveal(1300, 2000, 1000, 400)).toBe(1268);
  });

  it("never scrolls above the top", () => {
    expect(scrollTopToReveal(10, 40, 1000, 400)).toBe(0);
  });
});
