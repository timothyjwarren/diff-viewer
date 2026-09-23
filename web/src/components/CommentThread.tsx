import { useRef, useState } from "react";
import type { CommentThread as CommentThreadData, CommentAuthor } from "../types";
import { timeAgo } from "../lib/timeAgo";
import { CommentMarkdown } from "./CommentMarkdown";

function Avatar({ author }: { author: CommentAuthor }) {
  return (
    <span className={`comment-avatar comment-avatar-${author}`}>
      {author === "agent" ? "A" : "Y"}
    </span>
  );
}

/** In-place editor for an existing comment's raw Markdown. */
function CommentEditor({ initialBody, onSave, onCancel }: {
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialBody);
  const canSave = draft.trim() !== "";

  function save() {
    if (!canSave) return;
    if (draft === initialBody) onCancel();
    else onSave(draft);
  }

  return (
    <div className="comment-editor">
      <textarea
        className="comment-reply-expanded"
        value={draft}
        autoFocus
        onFocus={e => e.currentTarget.setSelectionRange(draft.length, draft.length)}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape" && draft === initialBody) onCancel();
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        }}
      />
      <div className="comment-reply-actions">
        <button onClick={save} disabled={!canSave}>Save</button>
        <button className="comment-cancel-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function CommentThread({ thread, onReply, onEdit, onDelete, onResolve }: {
  thread: CommentThreadData;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  // Resolving collapses the thread by default; the chevron lets the user
  // peek at it again without unresolving. Unresolving always re-expands.
  const [manualExpand, setManualExpand] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const expanded = focused || draft.length > 0;
  const collapsed = thread.resolved && !manualExpand;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submitReply(pending: boolean) {
    onReply(thread.id, draft, pending);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "";
  }

  return (
    <div className={`comment-thread${thread.resolved ? " comment-thread-resolved" : ""}`}>
      <div className="comment-thread-header">
        {thread.resolved && (
          <button
            type="button"
            className="diff-view-collapse-toggle"
            aria-label={collapsed ? "Show resolved thread" : "Hide resolved thread"}
            onClick={() => setManualExpand(v => !v)}
          >
            <span className={`diff-view-collapse-chevron${collapsed ? "" : " diff-view-collapse-chevron-open"}`} />
          </button>
        )}
        {thread.resolved && (
          <span className="comment-thread-resolved-label">
            Resolved &middot; {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
          </span>
        )}
        {thread.outdated && <span className="comment-thread-outdated-badge">Outdated</span>}
        <button
          type="button"
          className="comment-thread-resolve-button"
          onClick={() => { onResolve(thread.id, !thread.resolved); setManualExpand(false); }}
        >
          {thread.resolved ? "Unresolve" : "Resolve"}
        </button>
      </div>
      {!collapsed && (
        <>
          {thread.comments.map(comment => (
            <div key={comment.id} id={`comment-${comment.id}`} className={`comment comment-${comment.author}`}>
              <Avatar author={comment.author} />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{comment.author === "agent" ? "Agent" : "You"}</span>
                  <span className="comment-time">{timeAgo(comment.createdAt)}</span>
                  {comment.pending && <span className="comment-pending-badge">Pending</span>}
                  {comment.agentStatus === "acked" ? (
                    <span className="comment-acked-badge" title="The agent has read this and is working on it">
                      <span className="comment-acked-dot" />
                      Agent is working on this
                    </span>
                  ) : comment.agentStatus === "seen" ? (
                    <span className="comment-seen-badge" title="The agent has seen this comment">
                      <span className="comment-seen-dot" />
                      Seen
                    </span>
                  ) : null}
                </div>
                {editingId === comment.id ? (
                  <CommentEditor
                    initialBody={comment.body}
                    onSave={body => { onEdit(thread.id, comment.id, body); setEditingId(null); }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <CommentMarkdown body={comment.body} />
                )}
                {comment.author === "user" && editingId !== comment.id && (
                  <div className="comment-actions">
                    <button onClick={() => setEditingId(comment.id)}>Edit</button>
                    <button onClick={() => onDelete(thread.id, comment.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="comment-reply">
            <textarea
              ref={textareaRef}
              className={expanded ? "comment-reply-expanded" : ""}
              placeholder="Reply..."
              value={draft}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape" && draft.trim() === "") textareaRef.current?.blur();
                else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitReply(false); }
              }}
            />
            {expanded && (
              <div className="comment-reply-actions">
                <button onMouseDown={e => e.preventDefault()} onClick={() => submitReply(false)}>
                  Add single comment
                </button>
                <button onMouseDown={e => e.preventDefault()} onClick={() => submitReply(true)}>
                  Add to review
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
