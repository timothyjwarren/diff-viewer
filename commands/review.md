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
1. Choose a `--title`. The user is typically reviewing several diff-viewer
   tabs across several projects at once, so the title is the only thing that
   lets them find the right tab — make it specific enough to distinguish this
   session from every other one they might have open: name the project/repo
   *and* what's being reviewed (feature, branch, or task), not just the repo.
   Good: `"api-gateway: auth token refactor"`, `"checkout-web: PR 482 review"`.
   Bad: `"diff-viewer"`, `"review"`, a bare repo name with no task context.
   Run `diff-viewer start --title "<title>" $ARGUMENTS` via Bash. Parse the
   printed JSON for `sessionId` and `url`.
2. Open `url` in the user's default browser (`open <url>` on macOS,
   `xdg-open <url>` on Linux, `start <url>` on Windows).
3. Start watching for comments and verdicts with the `Monitor` tool — not a
   backgrounded `Bash` call — since this is a "notify me every time X
   happens, indefinitely" watch, not a one-shot wait:
   ```
   Monitor({
     command: "diff-viewer watch <sessionId>",
     description: "diff review comments/verdicts for <title>",
     persistent: true
   })
   ```
   `persistent: true` is correct here: the watch is meant to span the whole
   review session and is only ever torn down deliberately (step 6), not on a
   timeout. `diff-viewer watch` prints one JSON line per notification and
   exits on its own (printing a final `{"type":"session_ended"}` line) once
   `diff-viewer stop` has been run — a forgotten `TaskStop` is harmless.
   Do not also run `diff-viewer wait <sessionId>` while a `watch` is active
   for the same session; they share a cursor and will steal each other's
   notifications.
4. Tell the user the viewer is open and continue the conversation normally.
   Each time the Monitor delivers one or more notification lines, treat them
   as a trigger to re-check state, not as the payload itself — always run
   `diff-viewer review <sessionId>` for the full current picture (this keeps
   handling idempotent regardless of notification batching or ordering), then
   act on everything currently pending before returning to the conversation:
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
   - `type: "session_ended"` — the session was stopped (step 6 already ran,
     possibly by another agent/thread); nothing to do.
   The Monitor keeps running on its own after each notification — there is no
   need to re-arm it.
5. If invoked via another workflow (e.g. `/code-review`) while a session for
   this repo may already be open, check first with
   `diff-viewer sessions --repo <repo-path>`; if one is active, post findings
   into it with `diff-viewer comment <sessionId> <repoPath> <file>
   <lineStart> <lineEnd> <old|new> "<text>"` instead of (or in addition to)
   normal output.
6. When finished with the session, `diff-viewer stop <sessionId>` shuts down
   its server, and `TaskStop` the Monitor started in step 3.
