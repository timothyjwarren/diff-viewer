import { EXPAND_CHUNK_SIZE } from "../lib/expandContext";

export function ExpandStrip({ showUp, showDown, hiddenCount, onExpandUp, onExpandDown, onExpandAll }: {
  showUp: boolean;
  showDown: boolean;
  hiddenCount: number | null;
  onExpandUp?: () => void;
  onExpandDown?: () => void;
  onExpandAll: () => void;
}) {
  // Once the remaining gap is small enough to close in one click, both
  // buttons just fully close it instead of revealing another fixed chunk.
  const mergeAll = hiddenCount != null && hiddenCount <= EXPAND_CHUNK_SIZE;

  return (
    <div className="expand-strip">
      {showUp && (
        <button
          type="button" className="expand-strip-button"
          aria-label="Expand up" title="Expand up"
          onClick={mergeAll ? onExpandAll : onExpandUp}
        >
          <span className="expand-strip-chevron expand-strip-chevron-up" />
        </button>
      )}
      {showDown && (
        <button
          type="button" className="expand-strip-button"
          aria-label="Expand down" title="Expand down"
          onClick={mergeAll ? onExpandAll : onExpandDown}
        >
          <span className="expand-strip-chevron expand-strip-chevron-down" />
        </button>
      )}
    </div>
  );
}
