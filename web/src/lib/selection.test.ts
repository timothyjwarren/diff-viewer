import { describe, it, expect } from "vitest";
import { selectionReducer, type SelectionState } from "./selection";

const initial: SelectionState = null;

describe("selectionReducer", () => {
  it("selects a single line on click", () => {
    const state = selectionReducer(initial, { type: "click", file: "a.ts", side: "new", line: 5 });
    expect(state).toEqual({ file: "a.ts", side: "new", start: 5, end: 5 });
  });

  it("extends the range on shift-click within the same file/side", () => {
    const afterClick = selectionReducer(initial, { type: "click", file: "a.ts", side: "new", line: 5 });
    const state = selectionReducer(afterClick, { type: "shiftClick", file: "a.ts", side: "new", line: 8 });
    expect(state).toEqual({ file: "a.ts", side: "new", start: 5, end: 8 });
  });

  it("shift-click on a different file/side starts a fresh single-line selection", () => {
    const afterClick = selectionReducer(initial, { type: "click", file: "a.ts", side: "new", line: 5 });
    const state = selectionReducer(afterClick, { type: "shiftClick", file: "b.ts", side: "new", line: 2 });
    expect(state).toEqual({ file: "b.ts", side: "new", start: 2, end: 2 });
  });

  it("clears the selection", () => {
    const afterClick = selectionReducer(initial, { type: "click", file: "a.ts", side: "new", line: 5 });
    expect(selectionReducer(afterClick, { type: "clear" })).toBeNull();
  });
});
