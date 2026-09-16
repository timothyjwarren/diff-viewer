export interface SelectionRange {
  file: string;
  side: "old" | "new";
  start: number;
  end: number;
}

export type SelectionState = SelectionRange | null;

export type SelectionAction =
  | { type: "click"; file: string; side: "old" | "new"; line: number }
  | { type: "shiftClick"; file: string; side: "old" | "new"; line: number }
  | { type: "clear" };

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "click":
      return { file: action.file, side: action.side, start: action.line, end: action.line };
    case "shiftClick": {
      if (state && state.file === action.file && state.side === action.side) {
        const start = Math.min(state.start, action.line);
        const end = Math.max(state.end, action.line);
        return { file: action.file, side: action.side, start, end };
      }
      return { file: action.file, side: action.side, start: action.line, end: action.line };
    }
    case "clear":
      return null;
  }
}
