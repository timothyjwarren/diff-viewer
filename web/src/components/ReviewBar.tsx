import { useState } from "react";
import type { VerdictType } from "../types";

export function ReviewBar({ onSubmit }: { onSubmit: (type: VerdictType, summary?: string) => void }) {
  const [summary, setSummary] = useState("");

  return (
    <div className="review-bar">
      <textarea
        placeholder="Leave a summary (optional)"
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <div className="review-bar-actions">
        <button onClick={() => onSubmit("comment", summary || undefined)}>Comment</button>
        <button onClick={() => onSubmit("approve", summary || undefined)}>Approve</button>
        <button onClick={() => onSubmit("request_changes", summary || undefined)}>Request changes</button>
      </div>
    </div>
  );
}
