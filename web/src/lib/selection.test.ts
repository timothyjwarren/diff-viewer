import { describe, it, expect } from "vitest";
import { selectionReducer, type SelectionState } from "./selection";

const initial: SelectionState = null;

describe("selectionReducer", () => {
  it("anchors a single-line selection", () => {
    const state = selectionReducer(initial, { type: "anchor", file: "a.ts", side: "new", line: 5 });
    expect(state).toEqual({ file: "a.ts", side: "new", start: 5, end: 5 });
  });

  it("setRange replaces the selection with an explicit range", () => {
    const anchored = selectionReducer(initial, { type: "anchor", file: "a.ts", side: "new", line: 5 });
    const state = selectionReducer(anchored, { type: "setRange", file: "a.ts", side: "new", start: 5, end: 8 });
    expect(state).toEqual({ file: "a.ts", side: "new", start: 5, end: 8 });
  });

  it("setRange shrinks the range when dragging back past the anchor", () => {
    const grown = selectionReducer(initial, { type: "setRange", file: "a.ts", side: "new", start: 5, end: 8 });
    const shrunk = selectionReducer(grown, { type: "setRange", file: "a.ts", side: "new", start: 5, end: 6 });
    expect(shrunk).toEqual({ file: "a.ts", side: "new", start: 5, end: 6 });
  });

  it("clears the selection", () => {
    const anchored = selectionReducer(initial, { type: "anchor", file: "a.ts", side: "new", line: 5 });
    expect(selectionReducer(anchored, { type: "clear" })).toBeNull();
  });
});
