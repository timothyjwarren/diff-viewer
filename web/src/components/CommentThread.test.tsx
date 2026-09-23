import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentThread } from "./CommentThread";
import type { CommentThread as CommentThreadData } from "../types";

const thread: CommentThreadData = {
  id: "t1", repoPath: "/r", file: "a.ts", lineStart: 1, lineEnd: 1, side: "new", resolved: false,
  pinnedRef: "abc123", outdated: false,
  comments: [
    { id: "c1", author: "user", body: "why is this here?", pending: false, createdAt: "2026-01-01T00:00:00Z" },
    { id: "c2", author: "agent", body: "it handles the edge case", pending: false, createdAt: "2026-01-01T00:01:00Z" },
  ],
};

describe("CommentThread", () => {
  it("renders comments and labels the agent's reply distinctly", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getByText("why is this here?")).toBeInTheDocument();
    expect(screen.getByText("it handles the edge case")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders comment bodies as Markdown", () => {
    const mdThread: CommentThreadData = {
      ...thread,
      comments: [{ ...thread.comments[0], body: "use `foo`\n\n> quoted" }],
    };
    const { container } = render(<CommentThread thread={mdThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(container.querySelector(".comment-body code")).toHaveTextContent("foo");
    expect(container.querySelector(".comment-body blockquote")).toHaveTextContent("quoted");
  });

  it("submits a reply with the chosen pending flag", () => {
    const onReply = vi.fn();
    render(<CommentThread thread={thread} onReply={onReply} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Reply..."), { target: { value: "thanks!" } });
    fireEvent.click(screen.getByText("Add single comment"));
    expect(onReply).toHaveBeenCalledWith("t1", "thanks!", false);
  });

  describe("editing a comment", () => {
    function startEdit(onEdit = vi.fn()) {
      render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} onResolve={vi.fn()} />);
      fireEvent.click(screen.getByText("Edit"));
      return { onEdit, editor: screen.getByDisplayValue("why is this here?") as HTMLTextAreaElement };
    }

    it("replaces the comment with an editor holding its raw text", () => {
      const { editor } = startEdit();
      expect(editor.tagName).toBe("TEXTAREA");
      expect(editor).toHaveFocus();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("saves the edited text and closes the editor", () => {
      const { onEdit, editor } = startEdit();
      fireEvent.change(editor, { target: { value: "why is **this** here?" } });
      fireEvent.click(screen.getByText("Save"));
      expect(onEdit).toHaveBeenCalledWith("t1", "c1", "why is **this** here?");
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });

    it("saves with Cmd+Enter", () => {
      const { onEdit, editor } = startEdit();
      fireEvent.change(editor, { target: { value: "edited" } });
      fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
      expect(onEdit).toHaveBeenCalledWith("t1", "c1", "edited");
    });

    it("cancel discards changes without calling onEdit", () => {
      const { onEdit, editor } = startEdit();
      fireEvent.change(editor, { target: { value: "never mind" } });
      fireEvent.click(screen.getByText("Cancel"));
      expect(onEdit).not.toHaveBeenCalled();
      expect(screen.getByText("why is this here?")).toBeInTheDocument();
    });

    it("Escape cancels only when the text is unchanged", () => {
      const { editor } = startEdit();
      fireEvent.change(editor, { target: { value: "half-typed" } });
      fireEvent.keyDown(editor, { key: "Escape" });
      expect(screen.getByDisplayValue("half-typed")).toBeInTheDocument();
      fireEvent.change(editor, { target: { value: "why is this here?" } });
      fireEvent.keyDown(editor, { key: "Escape" });
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });

    it("disables Save when the text is empty", () => {
      const { editor } = startEdit();
      fireEvent.change(editor, { target: { value: "   " } });
      expect(screen.getByText("Save")).toBeDisabled();
    });

    it("closes without calling onEdit when saved unchanged", () => {
      const { onEdit } = startEdit();
      fireEvent.click(screen.getByText("Save"));
      expect(onEdit).not.toHaveBeenCalled();
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });
  });

  it("calls onDelete for a user's own comment", () => {
    const onDelete = vi.fn();
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} onResolve={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Delete")[0]);
    expect(onDelete).toHaveBeenCalledWith("t1", "c1");
  });

  it("shows a working indicator only on an acked comment", () => {
    const ackedThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "acked" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={ackedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getAllByText("Agent is working on this")).toHaveLength(1);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });

  it("shows a seen indicator on a seen-but-not-acked comment", () => {
    const seenThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "seen" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={seenThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getAllByText("Seen")).toHaveLength(1);
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("shows no indicator on an untouched comment", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("shows no indicator on a cleared comment (terminal state, not a revert to seen)", () => {
    const clearedThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "cleared" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={clearedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("resets a manually-enlarged reply textarea's height after submitting", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Reply...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "thanks!" } });
    textarea.style.height = "200px";

    fireEvent.click(screen.getByText("Add single comment"));

    expect(textarea.style.height).toBe("");
  });

  it("blurs the reply box on Escape when it's empty, like clicking away", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Reply...");
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(document.activeElement).not.toBe(textarea);
  });

  it("does not blur the reply box on Escape when it has text", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Reply...");
    fireEvent.change(textarea, { target: { value: "not empty" } });
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(document.activeElement).toBe(textarea);
  });

  it("submits the reply as a single comment on Cmd/Ctrl+Enter", () => {
    const onReply = vi.fn();
    render(<CommentThread thread={thread} onReply={onReply} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Reply...");
    fireEvent.change(textarea, { target: { value: "thanks!" } });

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onReply).toHaveBeenCalledWith("t1", "thanks!", false);
  });

  it("does not submit the reply on a plain Enter (inserts a newline instead)", () => {
    const onReply = vi.fn();
    render(<CommentThread thread={thread} onReply={onReply} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Reply...");
    fireEvent.change(textarea, { target: { value: "thanks!" } });

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onReply).not.toHaveBeenCalled();
  });

  it("calls onResolve when the Resolve button is clicked", () => {
    const onResolve = vi.fn();
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("Resolve"));
    expect(onResolve).toHaveBeenCalledWith("t1", true);
  });

  it("collapses comments and shows an Unresolve button once resolved", () => {
    const resolvedThread: CommentThreadData = { ...thread, resolved: true };
    render(<CommentThread thread={resolvedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.queryByText("why is this here?")).not.toBeInTheDocument();
    expect(screen.getByText("Unresolve")).toBeInTheDocument();
    expect(screen.getByText(/Resolved/)).toBeInTheDocument();
  });

  it("shows comments again on a resolved thread when the chevron is clicked", () => {
    const resolvedThread: CommentThreadData = { ...thread, resolved: true };
    render(<CommentThread thread={resolvedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Show resolved thread"));
    expect(screen.getByText("why is this here?")).toBeInTheDocument();
  });

  it("shows an Outdated badge when the thread's commented lines have changed", () => {
    const outdatedThread: CommentThreadData = { ...thread, outdated: true };
    render(<CommentThread thread={outdatedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getByText("Outdated")).toBeInTheDocument();
  });

  it("shows no Outdated badge for a current thread", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });
});
