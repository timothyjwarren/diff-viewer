---
description: Launch the local diff viewer for one or more repos/worktrees so the user can review changes side-by-side in the browser.
argument-hint: <path[:baseRef]> [path[:baseRef]] ...
---

Launch a diff review session for the given repo/worktree paths (space-separated;
append `:branch-or-ref` to any path to override its diff base, e.g.
`/repo:main-side-branch`). If no arguments were given, use the current
working directory.

Arguments: $ARGUMENTS

**$ARGUMENTS must be repo/worktree paths only** — `diff-viewer start` takes
positional filesystem paths, not a natural-language description of what to
review. If $ARGUMENTS is empty, or reads like an instruction/question rather
than one or more paths (e.g. the user typed `/review show me what I
changed`), do not pass it through literally — use the current directory (or
whatever repo/worktree the conversation is actually about) as the path
instead, and treat the prose as context for the conversation, not as CLI
arguments. Passing prose through directly makes each word its own invalid
repo path and the server refuses to start.

`<path[:baseRef]>`'s `baseRef` accepts any git ref: a branch name, or an
explicit commit SHA. This matters when there's no branch divergence to diff
(e.g. the changes were already committed straight to the default branch) —
in that case a bare `<path>` diffs against the merge-base of the current
branch, which is empty. Instead pass the *parent* of the range you want as
an explicit SHA, e.g. `/repo:abc1234` to review everything after commit
`abc1234`; this also populates the in-app commit picker with that range.

Steps:
1. Choose a `--title`. The user is typically reviewing several diff-viewer
   tabs across several projects at once, so the title is the only thing that
   lets them find the right tab — make it specific enough to distinguish this
   session from every other one they might have open: name the project/repo
   *and* what's being reviewed (feature, branch, or task), not just the repo.
   Good: `"api-gateway: auth token refactor"`, `"checkout-web: PR 482 review"`.
   Bad: `"diff-viewer"`, `"review"`, a bare repo name with no task context.
   Run `diff-viewer start --title "<title>" <path[:baseRef]>...` via Bash,
   using the paths determined above (not $ARGUMENTS verbatim unless it was
   already just paths). Parse the printed JSON for `sessionId` and `url`.
   If it fails instead, it prints exactly why (e.g. `Not a directory: ...` or
   `Not a git repository: ...`) — read that message and fix the invocation
   rather than retrying the same arguments.
2. Open `url` in the user's default browser (`open <url>` on macOS,
   `xdg-open <url>` on Linux, `start <url>` on Windows). Check the URL's
   port against what `start` printed before assuming an already-open browser
   tab is this session — each session listens on its own random port, so a
   tab showing a different repo or a stale diff is a leftover tab from a
   different session, not this one failing to navigate.
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
   - `type: "comment"` — an individual, immediately-posted comment (the
     "Add single comment" button, not "Add to review" — pending comments
     stay invisible to you until bundled into a verdict below, and are never
     ack'd since they aren't processed individually at all).

     Every comment carries a one-way, browser-visible status: untouched
     (no badge) → **seen** (a muted dot, automatic — `diff-viewer review`
     marks everything it returns as seen the moment you read it, no
     separate call needed) → **acked** (a pulsing "agent is working on
     this" dot, manual — only `ack` sets it) → **cleared** (no badge again,
     manual — only `unack` sets it, once you're done and about to reply).
     `unack` moves straight to "cleared", *not* back to "seen" — it's a
     distinct terminal state (badge-less, like untouched, but meaning
     "fully handled" rather than "not yet looked at"), and re-fetching via
     `review` later never resurrects a cleared comment's badge.

     **Ack every single comment before doing anything else in response to
     it — no exceptions.** This applies even when the comment feels like a
     quick continuation of an already-open conversation (e.g. the user
     replying to your own reply) — it is easy to skip ack on those because
     they don't feel like a fresh request, but the user can't tell the
     difference between "the agent is about to respond" and "the agent
     hasn't looked at this yet" unless you ack it every time. If you catch
     yourself about to call `reply` for a single comment without having
     just called `ack` for that exact comment, stop and ack first. Work
     through each one in this order:
     1. **Ack it immediately**: `diff-viewer ack <sessionId> <threadId>
        <commentId>` (the notification itself carries `threadId` and
        `commentId`) — before you've done anything else.
     2. **Process it**, without editing code: read it with `diff-viewer
        review <sessionId>`. It may be a question *or* a requested change —
        either way, **do not edit code from this alone**, even if it reads
        like an unambiguous instruction. If it's a question, work out the
        answer. If it's a change request, just note it (mentally / in your
        own task tracking) so it's ready to apply later — this mirrors how
        a human reviewer's individual PR comments don't each trigger a push;
        the requested changes land once, as a batch, when the review
        finishes.
     3. **Unack it**: `diff-viewer unack <sessionId> <threadId>
        <commentId>`, now that processing is done — *before* replying, not
        after, so the "working" indicator disappears cleanly instead of
        overlapping with the reply that's about to appear.
     4. **Reply**: `diff-viewer reply <sessionId> <threadId> "<text>"`
        and/or in chat — answer the question, or for a change request,
        acknowledge it plainly, e.g. "Noted — I'll make this change once you
        finish your review." Take no other action yet regardless of how the
        comment reads.
     Only two things authorize actually making a noted change: a
     `changes_requested` verdict (below), or the user explicitly saying in
     chat that they're done / to go ahead now — either overrides the
     deferral, including for comments noted earlier in the same session.
   - `type: "verdict"` — the user submitted a review. Run
     `diff-viewer review <sessionId>` to see all verdicts (each with a
     computed `intent`: `"discussion"` for Comment/Approve, or
     `"changes_requested"` for Request Changes) and their bundled comments.
     Only treat `changes_requested` verdicts as work to do — this is where
     you actually implement everything requested, both in this verdict's
     bundled comments and any single comments noted earlier in the session.
     Treat `discussion` verdicts (Comment/Approve) as conversation, not
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
