import { useState } from "react";
import type { CommentThread as CommentThreadData, CommentAuthor } from "../types";
import { timeAgo } from "../lib/timeAgo";

function Avatar({ author }: { author: CommentAuthor }) {
  return (
    <span className={`comment-avatar comment-avatar-${author}`}>
      {author === "agent" ? "A" : "U"}
    </span>
  );
}

export function CommentThread({ thread, onReply, onEdit, onDelete }: {
  thread: CommentThreadData;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const expanded = focused || draft.length > 0;

  return (
    <div className="comment-thread">
      {thread.comments.map(comment => (
        <div key={comment.id} className={`comment comment-${comment.author}`}>
          <Avatar author={comment.author} />
          <div className="comment-body">
            <div className="comment-meta">
              <span className="comment-author">{comment.author === "agent" ? "Agent" : "You"}</span>
              <span className="comment-time">{timeAgo(comment.createdAt)}</span>
              {comment.pending && <span className="comment-pending-badge">Pending</span>}
            </div>
            <p>{comment.body}</p>
            {comment.author === "user" && (
              <div className="comment-actions">
                <button onClick={() => onEdit(thread.id, comment.id, comment.body)}>Edit</button>
                <button onClick={() => onDelete(thread.id, comment.id)}>Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="comment-reply">
        <textarea
          className={expanded ? "comment-reply-expanded" : ""}
          placeholder="Reply..."
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={e => setDraft(e.target.value)}
        />
        {expanded && (
          <div className="comment-reply-actions">
            <button onMouseDown={e => e.preventDefault()} onClick={() => { onReply(thread.id, draft, false); setDraft(""); }}>
              Add single comment
            </button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { onReply(thread.id, draft, true); setDraft(""); }}>
              Add to review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
