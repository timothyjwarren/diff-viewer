import { useEffect, useState } from "react";
import type { VerdictType } from "../types";
import { CheckIcon } from "./Icons";

const LABELS: Record<VerdictType, string> = {
  comment: "Comment",
  approve: "Approve",
  request_changes: "Request changes",
};

export function ReviewBar({ onSubmit, pendingCount = 0 }: {
  onSubmit: (type: VerdictType, summary?: string) => void;
  /** Pending comments that submitting a verdict will publish. */
  pendingCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [submitted, setSubmitted] = useState<VerdictType | null>(null);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => setSubmitted(null), 3000);
    return () => clearTimeout(timer);
  }, [submitted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function submit(type: VerdictType) {
    onSubmit(type, summary || undefined);
    setSummary("");
    setSubmitted(type);
    setOpen(false);
  }

  return (
    <div className="review-bar">
      {open && (
        <div className="review-bar-popover">
          <textarea
            placeholder="Leave a summary (optional)"
            value={summary} autoFocus
            onChange={e => setSummary(e.target.value)}
          />
          <div className="review-bar-actions">
            <button className="btn" onClick={() => submit("comment")}>Comment</button>
            <button className="btn btn-danger" onClick={() => submit("request_changes")}>Request changes</button>
            <button className="btn btn-success" onClick={() => submit("approve")}>Approve</button>
          </div>
        </div>
      )}
      <div className="review-bar-footer">
        {submitted ? (
          <span className="review-submitted-badge"><CheckIcon /> {LABELS[submitted]} submitted</span>
        ) : pendingCount > 0 && (
          <span className="review-bar-pending">{pendingCount} pending</span>
        )}
        <button className={`btn review-bar-toggle${open ? "" : " btn-primary"}`} onClick={() => setOpen(v => !v)}>
          {open ? "Cancel" : "Finish your review"}
        </button>
      </div>
    </div>
  );
}
