import { useRef, useState } from "react";

function formatQuote(text: string): string {
  return text.split("\n").map(line => `> ${line}`).join("\n") + "\n\n";
}

export function Composer({ onSubmit, onCancel, quotedText }: {
  onSubmit: (body: string, pending: boolean) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  quotedText: string | null;
}) {
  const [draft, setDraft] = useState(() => (quotedText ? formatQuote(quotedText) : ""));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "";
  }

  // A handler that returns (or resolves to) `false` reports the save failed;
  // the draft stays so it can be retried.
  function submit(pending: boolean) {
    const result = onSubmit(draft, pending);
    if (result instanceof Promise) void result.then(saved => { if (saved !== false) reset(); });
    else if (result !== false) reset();
  }

  return (
    <div className="comment-composer">
      <textarea
        ref={textareaRef}
        placeholder="Leave a comment..." value={draft} autoFocus
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape" && draft.trim() === "") onCancel();
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(false); }
        }}
      />
      <div className="comment-reply-actions">
        <button className="btn btn-primary" title="⌘↵" onClick={() => submit(false)}>Add single comment</button>
        <button className="btn" onClick={() => submit(true)}>Add to review</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
