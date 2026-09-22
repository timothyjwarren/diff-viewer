import { useEffect, useState } from "react";
import type { CommitInfo, CommitRange } from "../types";
import { computeRangeClick, isShaInRange, rangeCommitCount } from "../lib/commitRange";

export function CommitChooser({ commits, range, onChange, onOpen }: {
  commits: CommitInfo[];
  range: CommitRange | null;
  onChange: (range: CommitRange | null) => void;
  /** Called each time the popover opens, so the caller can refresh `commits` with new HEAD commits. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Set on mousedown over a row, cleared on mouseup: while set, a range is
  // being dragged out from this sha. A plain click (mousedown+mouseup on
  // the same row, no drag) is just the zero-distance case of a drag.
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);

  useEffect(() => {
    if (!dragAnchor) return;
    function finishDrag() {
      const finalSha = dragHover ?? dragAnchor!;
      const next = computeRangeClick(commits, { anchor: dragAnchor!, from: dragAnchor!, to: dragAnchor! }, finalSha, true);
      onChange({ from: next.from, to: next.to });
      setDragAnchor(null);
      setDragHover(null);
      setOpen(false);
    }
    window.addEventListener("mouseup", finishDrag);
    return () => window.removeEventListener("mouseup", finishDrag);
  }, [dragAnchor, dragHover, commits, onChange]);

  if (commits.length === 0) return null;

  function toggleOpen() {
    setOpen(o => {
      if (!o) onOpen?.();
      return !o;
    });
  }

  const label = range
    ? `${rangeCommitCount(commits, range)} of ${commits.length}`
    : `all ${commits.length} commits`;
  const excludedCount = range ? commits.length - rangeCommitCount(commits, range) : 0;

  // While dragging, the row highlight previews the in-progress drag range
  // rather than the last-committed `range` prop, so the drag reads live —
  // onChange only fires once, at mouseup, to avoid re-fetching the diff on
  // every row the drag passes over.
  const previewRange = dragAnchor
    ? computeRangeClick(commits, { anchor: dragAnchor, from: dragAnchor, to: dragAnchor }, dragHover ?? dragAnchor, true)
    : null;

  function isSelected(sha: string): boolean {
    if (previewRange) return isShaInRange(commits, { from: previewRange.from, to: previewRange.to }, sha);
    return Boolean(range && isShaInRange(commits, range, sha));
  }

  function showAll() {
    onChange(null);
    setOpen(false);
  }

  return (
    <div className="commit-chooser">
      <button
        type="button"
        className={`commit-chooser-trigger${range ? " commit-chooser-trigger-narrowed" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`commit range, ${label}`}
        onClick={toggleOpen}
      >
        {label} &#9662;
        {excludedCount > 0 && (
          <span className="commit-chooser-excluded-badge" aria-label={`${excludedCount} commits not shown`}>
            {excludedCount}
          </span>
        )}
      </button>
      {open && (
        <ul className="commit-chooser-popover" role="listbox" aria-multiselectable="true">
          <li className="commit-chooser-reset-row">
            <button type="button" className="commit-chooser-reset" onClick={showAll}>
              {!range && <span className="commit-chooser-check">&#10003; </span>}
              Show all commits
            </button>
          </li>
          {commits.map(c => {
            const selected = isSelected(c.sha);
            return (
              <li key={c.sha}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`commit-chooser-row${selected ? " commit-chooser-row-selected" : ""}${c.sha === "uncommitted" ? " commit-chooser-row-uncommitted" : ""}`}
                  onMouseDown={() => { setDragAnchor(c.sha); setDragHover(c.sha); }}
                  onMouseEnter={() => { if (dragAnchor) setDragHover(c.sha); }}
                >
                  <span className="commit-chooser-sha">{c.shortSha}</span>
                  <span className="commit-chooser-subject">{c.subject}</span>
                  <span className="commit-chooser-author">{c.author}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
