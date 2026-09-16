import { useEffect, useState } from "react";
import type { VerdictType } from "../types";

const LABELS: Record<VerdictType, string> = {
  comment: "Comment",
  approve: "Approve",
  request_changes: "Request changes",
};

export function ReviewBar({ onSubmit }: { onSubmit: (type: VerdictType, summary?: string) => void }) {
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
  }

  return (
    <div className="review-bar">
      <textarea
        placeholder="Leave a summary (optional)"
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <div className="review-bar-actions">
        <button onClick={() => submit("comment")}>Comment</button>
        <button onClick={() => submit("approve")}>Approve</button>
        <button onClick={() => submit("request_changes")}>Request changes</button>
        {submitted && <span className="review-submitted-badge">✓ {LABELS[submitted]} submitted</span>}
      </div>
    </div>
  );
}
