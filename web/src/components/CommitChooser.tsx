import { useEffect, useRef, useState } from "react";
import type { CommitInfo, CommitRange } from "../types";
import { computeRangeClick, isShaInRange, rangeCommitCount } from "../lib/commitRange";

/** The chooser's "everything" mode: baseRef through the working tree, committed history plus any local edits. */
const EVERYTHING_RANGE: CommitRange = { from: "", to: "uncommitted" };

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
  const popoverRef = useRef<HTMLUListElement>(null);

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
    // Auto-scrolls the popover when the drag nears its top/bottom edge —
    // without this, rows below the visible ~320px are unreachable while
    // dragging, since releasing the mouse to scroll manually ends the drag.
    function autoScroll(e: MouseEvent) {
      const el = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edge = 24;
      if (e.clientY < rect.top + edge) el.scrollTop -= 12;
      else if (e.clientY > rect.bottom - edge) el.scrollTop += 12;
    }
    window.addEventListener("mouseup", finishDrag);
    window.addEventListener("mousemove", autoScroll);
    return () => {
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("mousemove", autoScroll);
    };
  }, [dragAnchor, dragHover, commits, onChange]);

  if (commits.length === 0) return null;

  function toggleOpen() {
    setOpen(o => {
      if (!o) onOpen?.();
      return !o;
    });
  }

  const realCommitCount = commits.filter(c => c.sha !== "uncommitted").length;
  const hasUncommittedRow = realCommitCount !== commits.length;
  const isEverythingMode = range?.from === EVERYTHING_RANGE.from && range?.to === EVERYTHING_RANGE.to;

  const label = isEverythingMode
    ? `all ${realCommitCount} + uncommitted`
    : range
      ? `${rangeCommitCount(commits, range)} of ${commits.length}`
      : `all ${realCommitCount} commits`;
  // The default (no-range) view always excludes the uncommitted row by
  // design (Task 3) — so it counts as excluded here too, not just the
  // commits a narrowed range leaves out. "Everything" mode excludes nothing.
  const excludedCount = isEverythingMode
    ? 0
    : range
      ? commits.length - rangeCommitCount(commits, range)
      : (hasUncommittedRow ? 1 : 0);

  // While dragging, the row highlight previews the in-progress drag range
  // rather than the last-committed `range` prop, so the drag reads live —
  // onChange only fires once, at mouseup, to avoid re-fetching the diff on
  // every row the drag passes over.
  const previewRange = dragAnchor
    ? computeRangeClick(commits, { anchor: dragAnchor, from: dragAnchor, to: dragAnchor }, dragHover ?? dragAnchor, true)
    : null;

  function isSelected(sha: string): boolean {
    if (previewRange) return isShaInRange(commits, { from: previewRange.from, to: previewRange.to }, sha);
    if (isEverythingMode) return true;
    return Boolean(range && isShaInRange(commits, range, sha));
  }

  function showAll() {
    onChange(null);
    setOpen(false);
  }

  function showAllWithUncommitted() {
    onChange(EVERYTHING_RANGE);
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
        <ul className="commit-chooser-popover" role="listbox" aria-multiselectable="true" ref={popoverRef}>
          <li className="commit-chooser-reset-row">
            <button type="button" className="commit-chooser-reset" onClick={showAll}>
              {!range && <span className="commit-chooser-check">&#10003; </span>}
              Show all commits
            </button>
          </li>
          {hasUncommittedRow && (
            <li className="commit-chooser-reset-row">
              <button type="button" className="commit-chooser-reset" onClick={showAllWithUncommitted}>
                {isEverythingMode && <span className="commit-chooser-check">&#10003; </span>}
                Show all commits + uncommitted changes
              </button>
            </li>
          )}
          {commits.map(c => {
            const selected = isSelected(c.sha);
            return (
              <li key={c.sha}>
                {/*
                 * A plain div, not a button: browsers implicitly capture the
                 * mouse to a pressed form control, which silently suppresses
                 * mouseenter on sibling elements during a drag — the same
                 * reason the diff-line gutter drag-select (DiffView.tsx) uses
                 * a span rather than a button. tabIndex+onKeyDown keep it
                 * keyboard-selectable despite not being a native control.
                 */}
                <div
                  role="option"
                  tabIndex={0}
                  aria-selected={selected}
                  className={`commit-chooser-row${selected ? " commit-chooser-row-selected" : ""}${c.sha === "uncommitted" ? " commit-chooser-row-uncommitted" : ""}`}
                  onMouseDown={() => { setDragAnchor(c.sha); setDragHover(c.sha); }}
                  onMouseEnter={() => { if (dragAnchor) setDragHover(c.sha); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChange({ from: c.sha, to: c.sha });
                      setOpen(false);
                    }
                  }}
                >
                  <span className="commit-chooser-sha">{c.shortSha}</span>
                  <span className="commit-chooser-subject">{c.subject}</span>
                  <span className="commit-chooser-author">{c.author}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
