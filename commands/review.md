---
description: Launch the local diff viewer for one or more repos/worktrees so the user can review changes side-by-side in the browser.
argument-hint: <path[:baseRef]> [path[:baseRef]] ...
---

Launch a diff review session for the given repo/worktree paths (space-separated;
append `:branch-or-ref` to any path to override its diff base, e.g.
`/repo:main-side-branch`). If no arguments were given, use the current
working directory.

Arguments: $ARGUMENTS

Steps:
1. Run `diff-viewer start $ARGUMENTS` via Bash. Parse the printed JSON for
   `sessionId` and `url`.
2. Open `url` in the user's default browser (`open <url>` on macOS,
   `xdg-open <url>` on Linux, `start <url>` on Windows).
3. Start a background Bash command `diff-viewer wait <sessionId>` with
   `run_in_background: true` so you are notified automatically the next time
   the user posts an immediate comment or submits a review — no need to ask
   them if they're done.
4. Tell the user the viewer is open and continue the conversation normally.
   When the background `wait` command completes, inspect its notifications:
   - `type: "comment"` — the user asked an inline question; read it with
     `diff-viewer review <sessionId>` and answer it, replying in the viewer
     with `diff-viewer reply <sessionId> <threadId> "<text>"` and/or in chat.
   - `type: "verdict"` — the user submitted a review. Run
     `diff-viewer review <sessionId>` to see all verdicts (each with a
     computed `intent`: `"discussion"` for Comment/Approve, or
     `"changes_requested"` for Request Changes) and their bundled comments.
     Only treat `changes_requested` verdicts as work to do; treat
     `discussion` verdicts and standalone comments as conversation, not
     instructions.
   After handling a notification, re-run `diff-viewer wait <sessionId>` in
   the background again to keep listening.
5. If invoked via another workflow (e.g. `/code-review`) while a session for
   this repo may already be open, check first with
   `diff-viewer sessions --repo <repo-path>`; if one is active, post findings
   into it with `diff-viewer comment <sessionId> <repoPath> <file>
   <lineStart> <lineEnd> <old|new> "<text>"` instead of (or in addition to)
   normal output.
6. When finished with the session, `diff-viewer stop <sessionId>` shuts down
   its server.
