export interface SelectionRange {
  file: string;
  side: "old" | "new";
  start: number;
  end: number;
}

export type SelectionState = SelectionRange | null;

export type SelectionAction =
  // Starts (or replaces) a selection at a single line — fired on gutter mousedown.
  | { type: "anchor"; file: string; side: "old" | "new"; line: number }
  // Sets the selection to an explicit [start, end] range — fired on gutter mouseenter
  // while dragging, computed by the caller against a fixed drag-start anchor (not
  // against the current state) so dragging back past the anchor shrinks the range
  // instead of getting stuck at the farthest point ever reached.
  | { type: "setRange"; file: string; side: "old" | "new"; start: number; end: number }
  | { type: "clear" };

export function selectionReducer(_state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "anchor":
      return { file: action.file, side: action.side, start: action.line, end: action.line };
    case "setRange":
      return { file: action.file, side: action.side, start: action.start, end: action.end };
    case "clear":
      return null;
  }
}
