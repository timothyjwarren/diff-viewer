import { useState } from "react";
import type { CommentThread as CommentThreadData } from "../types";

export function CommentThread({ thread, onReply, onEdit, onDelete }: {
  thread: CommentThreadData;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="comment-thread">
      {thread.comments.map(comment => (
        <div key={comment.id} className={`comment comment-${comment.author}`}>
          <span className="comment-author">{comment.author === "agent" ? "Agent" : "You"}</span>
          {comment.pending && <span className="comment-pending-badge">Pending</span>}
          <p>{comment.body}</p>
          {comment.author === "user" && (
            <div className="comment-actions">
              <button onClick={() => onEdit(thread.id, comment.id, comment.body)}>Edit</button>
              <button onClick={() => onDelete(thread.id, comment.id)}>Delete</button>
            </div>
          )}
        </div>
      ))}
      <textarea
        placeholder="Reply..."
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      <div className="comment-reply-actions">
        <button onClick={() => { onReply(thread.id, draft, false); setDraft(""); }}>
          Add single comment
        </button>
        <button onClick={() => { onReply(thread.id, draft, true); setDraft(""); }}>
          Add to review
        </button>
      </div>
    </div>
  );
}
