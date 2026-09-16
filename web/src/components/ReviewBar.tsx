import { useEffect, useState } from "react";
import type { VerdictType } from "../types";

const LABELS: Record<VerdictType, string> = {
  comment: "Comment",
  approve: "Approve",
  request_changes: "Request changes",
};

export function ReviewBar({ onSubmit }: { onSubmit: (type: VerdictType, summary?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [submitted, setSubmitted] = useState<VerdictType | null>(null);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => setSubmitted(null), 3000);
    return () => clearTimeout(timer);
  }, [submitted]);

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
            value={summary}
            onChange={e => setSummary(e.target.value)}
          />
          <div className="review-bar-actions">
            <button onClick={() => submit("comment")}>Comment</button>
            <button onClick={() => submit("approve")} className="review-bar-primary">Approve</button>
            <button onClick={() => submit("request_changes")}>Request changes</button>
          </div>
        </div>
      )}
      <div className="review-bar-footer">
        {submitted && <span className="review-submitted-badge">&#10003; {LABELS[submitted]} submitted</span>}
        <button className="review-bar-toggle" onClick={() => setOpen(v => !v)}>
          {open ? "Cancel" : "Finish your review"}
        </button>
      </div>
    </div>
  );
}
