import { useState } from "react";
import type { CommitInfo, CommitRange } from "../types";
import { computeRangeClick, isShaInRange, rangeCommitCount, type CommitRangeState } from "../lib/commitRange";

export function CommitChooser({ commits, range, onChange, onOpen }: {
  commits: CommitInfo[];
  range: CommitRange | null;
  onChange: (range: CommitRange | null) => void;
  /** Called each time the popover opens, so the caller can refresh `commits` with new HEAD commits. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rangeState, setRangeState] = useState<CommitRangeState | null>(null);

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

  function selectCommit(sha: string, shiftKey: boolean) {
    const next = computeRangeClick(commits, rangeState, sha, shiftKey);
    setRangeState(next);
    onChange({ from: next.from, to: next.to });
    setOpen(false);
  }

  function showAll() {
    setRangeState(null);
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
            const selected = Boolean(range && isShaInRange(commits, range, c.sha));
            return (
              <li key={c.sha}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`commit-chooser-row${selected ? " commit-chooser-row-selected" : ""}${c.sha === "uncommitted" ? " commit-chooser-row-uncommitted" : ""}`}
                  onClick={e => selectCommit(c.sha, e.shiftKey)}
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
