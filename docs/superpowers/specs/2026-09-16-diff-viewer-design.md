# Diff Viewer — Design Spec

## Purpose

A local, GitHub-PR-style diff viewer that a Claude Code agent launches on
request ("show me the diff"). Unlike GitHub, it must show diffs across
**multiple repos/worktrees at once**, so a user working on several
branches across several repos can review everything before opening
individual PRs. The user reviews in the browser (side-by-side diff,
syntax highlighting, expandable context, full-file view, inline
comments), while the agent remains free for interactive chat in the
same conversation. When the user submits their review, the agent is
notified automatically (no manual "I'm done, go check" needed) and can
fetch the structured comments/verdict, and can also post threaded
replies back into the viewer.

## Non-goals (v1)

- No auth/multi-user support — strictly local, `127.0.0.1`-only.
- No GitHub integration — this does not talk to GitHub or create PRs.
- No per-commit diff view (stretch goal, see below).
- No "changes since you last reviewed" tracking (stretch goal).

## Architecture

Delivered as a Claude Code plugin with three parts:

1. **Slash command** (e.g. `/diff-viewer:review`) — script invoked by
   the agent via Bash. Starts the server (if not already running for
   this session), waits for it to report its assigned port, opens the
   user's default browser to the session URL, and returns immediately
   — it does not block.
2. **Node/TypeScript + Express server** — one process per review
   session, bound to `127.0.0.1` on an OS-assigned free port (no auth
   needed; port is naturally private). Responsibilities:
   - Shell out to `git` for diff/worktree/file data.
   - Serve the built React SPA.
   - Expose a small JSON HTTP API (session state, comments, verdicts,
     file content, long-poll for submit events).
   - Persist session state (repos, comments, verdicts) to a JSON file
     under a per-session data directory on every mutation, so state is
     inspectable and survives a server restart.
3. **Bundled CLI** (`bin/diff-viewer`) — the agent's interface via
   Bash:
   - `diff-viewer start <path[:baseRef]>...` → starts (or attaches to)
     a session; prints `{ sessionId, port, url }` as JSON.
   - `diff-viewer wait <sessionId>` → long-polls, blocking until the
     next Submit event; intended to be run with `run_in_background:
     true` so Claude Code notifies the agent automatically when it
     returns.
   - `diff-viewer review <sessionId>` → prints the latest verdict plus
     all comment threads as JSON.
   - `diff-viewer reply <sessionId> <commentId> <text>` → agent posts a
     threaded reply visible live in the browser.
   - `diff-viewer stop <sessionId>` → shuts down that session's server.

Multiple sessions can run concurrently (e.g. two separate "show me the
diff" requests in different conversations), each its own process/port.

## Session lifecycle

- A session stays running until explicitly stopped (`diff-viewer
  stop`) or the user closes it from the UI — it is **not** terminal on
  Submit. This lets the agent make changes based on feedback and the
  user look again in the same browser tab (server re-diffs on
  request/refresh).
- Submit is a repeatable action: each click appends a new verdict
  entry. The agent re-issues `wait` after handling a submission if it
  wants to be notified of the next one.
- Comments persist visibly in the UI across the session, are
  editable/deletable by the user, and can be replied to by the agent
  at any time (not gated on Submit).

## Data model

```
Session {
  id: string
  repos: [{ path: string, name: string, baseRef: string }]
  createdAt: timestamp
  status: "active" | "stopped"
}

CommentThread {
  id: string
  repoPath: string
  file: string
  lineRange: { start: number, end: number }
  side: "old" | "new"
  resolved: boolean
  comments: [{
    id: string
    author: "user" | "agent"
    body: string
    suggestion?: string   // optional literal replacement code block
    createdAt: timestamp
  }]
}

Verdict {
  id: string
  type: "comment" | "approve" | "request_changes"
  summary?: string
  submittedAt: timestamp
}
```

## Diff computation

For each repo/worktree:

- `baseRef` defaults to the merge-base between HEAD and the repo's
  detected default branch (`main`/`master`, via `git symbolic-ref` /
  `origin/HEAD`); an explicit override may be given as
  `path:baseRef` on the CLI for side-branch review.
- Diff shown = `git diff <baseRef>...HEAD` (committed changes since
  merge-base) combined with `git diff HEAD` (uncommitted working-tree
  changes) — i.e. "everything that would currently go into the PR."
- Parsed per-file into added/modified/deleted/renamed with hunks.
- **"View File"** and **expand context** read file content directly
  off disk (or via `git show <ref>:<path>` for the pre-image) on
  demand — full file contents are not preloaded for every file.

## Frontend UI/UX

- Left sidebar: repos listed and collapsible, each expandable into its
  changed-files tree (GitHub "Files changed" style).
- Main pane: selected file's side-by-side diff, syntax-highlighted
  (via `shiki`). Each pane column is a structurally independent
  scrollable element (not one interleaved table) so text selection
  stays confined to the side the user is copying from.
- File headers show `<repo/worktree name> › <path>`, since files from
  different worktrees can share a filename.
- Per-file: "View File" toggle for full-file view; expandable context
  above/below hunks (fetched from disk).
- Commenting: select a line or drag a range → inline comment box.
  Supports plain text plus an optional "suggest code change" block in
  the same box (small UI addition over plain text, included in v1
  rather than deferred).
- Comment threads render inline under their hunk; editable/deletable
  by the user; agent replies are visually distinct (e.g. "Agent"
  label).
- Top-level review bar (GitHub-style): overall summary box +
  **Comment / Approve / Request changes** buttons that fire Submit.
- Cross-repo framing: page is a "Review Session" containing N repos,
  each independently collapsible — no single unified "PR," since none
  of this maps to a real GitHub PR.

## Stretch goals (explicitly out of scope for v1)

- Per-commit diff view (like GitHub's commit-by-commit dropdown).
- "Changes since you last reviewed" — requires tracking a per-session
  last-seen commit/timestamp and diffing against it.
