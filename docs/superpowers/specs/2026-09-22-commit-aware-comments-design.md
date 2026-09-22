# Commit-aware comments: design

## Problem

Comments are pinned to an absolute `lineStart`/`lineEnd` in a file with no
record of what commit (or working-tree state) they were made against. Two
consequences:

- If a later commit shifts line numbers in a file (e.g. lines added above
  the commented range) without touching the commented code itself, the
  comment silently stays at the old line numbers and drifts onto unrelated
  code.
- If a later commit actually changes the commented lines, there's no way to
  tell — the comment looks just as valid as one made five seconds ago.

Separately, the diff view has no concept of "uncommitted changes" as a
distinct, visible state: the default session view (no commit range picked)
silently includes live working-tree edits in the diff, with no indicator
that what's shown isn't committed.

This session is long-lived — the same `diff-viewer` session stays open
across multiple commits as review feedback gets addressed, so this has to
work live, not just at session-open time.

## Goals

- Represent "uncommitted changes" as an explicit, opt-in view rather than a
  silent default.
- Track which commit (or the uncommitted state) each comment thread was
  made against.
- When the repo's commit/working-tree state changes, reposition threads
  whose commented lines are unaffected, and mark threads outdated when
  their commented lines were actually changed.
- Backfill a thread's pin from "uncommitted" to a real commit SHA once the
  commented code is actually committed.

## Non-goals

- Cross-branch or cross-rebase comment tracking (only linear history within
  one session's repo is in scope).
- Re-validating an outdated thread if the code later reverts to match — once
  outdated, always outdated (mirrors the existing terminal
  `seen -> acked -> cleared` comment-status pattern; no reason to special
  case this one).

## 1. Uncommitted changes as a pseudo-commit

`GET /api/commits` (backed by `listCommits`, `src/git/gitRepo.ts`) currently
runs `git log --reverse baseRef..HEAD` and returns only real commits.

- The route also runs `git status --porcelain`. If non-empty, it appends one
  synthetic entry to the returned list: `{ sha: "uncommitted", ... }`, with
  timestamp `null`/"now" and no author, rendered by `CommitChooser.tsx` as
  a visually distinct "Uncommitted changes" row (different color/icon from
  real commits).
- This row is **never** part of the default selection. On session load with
  no range picked, the view is the full committed range (`baseRef..HEAD`)
  only — `computeDiff` changes from `git diff <baseRef>` (which diffs
  against the working tree) to `git diff <baseRef> HEAD` by default.
  Working-tree changes are visible only when the user explicitly selects
  the "Uncommitted changes" row, at which point `computeRangeDiff` is asked
  for a to-ref of `"uncommitted"` and falls back to the current
  `git diff <from>` (working-tree) behavior for that one case.
- When viewing the uncommitted pseudo-commit, `DiffView`/`Pane` render a
  persistent banner ("Viewing uncommitted changes") so it's unambiguous.
- The collapsed `CommitChooser` toggle button shows a small badge (reusing
  the dot styling from `.new-comment-banner`) whenever the currently
  selected range excludes real commits newer than its `to` ref, or excludes
  a dirty-but-unselected "Uncommitted changes" row.

## 2. Data model

`CommentThread` gains two fields (`src/types.ts`, `web/src/types.ts`):

```ts
pinnedRef: string | "uncommitted";
outdated: boolean;
```

`pinnedRef` is stamped at creation time from whatever `to`-ref the diff was
rendered against (a real SHA, or the `"uncommitted"` sentinel).

Each distinct `(file, pinnedRef)` pair gets one cached content snapshot at
the session level (not per-thread, to avoid duplicating file content across
many comments on the same file/commit):

```ts
// SessionData, alongside threads/verdicts
contentSnapshots: Record<string, string>; // key: `${pinnedRef}:${file}`
```

For a real `pinnedRef`, the snapshot is fetched once via
`git show <pinnedRef>:<file>` the first time it's needed and cached. For
`"uncommitted"`, it's captured directly (the working-tree file content) the
first time a thread pins to it for that file, since there's no ref to
`git show` later.

Session-level (not persisted in `SessionData`, held in memory by
`SessionStore` and recomputed on demand): `lastKnownHeadSha` and
`lastKnownDirty`, used to detect drift on each poll.

## 3. Live drift detection

New route `GET /api/repo-state?repoPath=...` runs `git rev-parse HEAD` and
`git status --porcelain`, returning `{ headSha, dirty }`. The browser's
existing 3s poll loop (currently only `fetchThreads`) also calls this; when
either value changes since the last poll, the server recomputes thread
positions before the next `/api/threads` response. The client stays dumb —
it only ever renders whatever `lineStart`/`lineEnd`/`outdated` comes back.

Recompute, per thread:

1. Fetch the thread's `contentSnapshot` (session cache, per above).
2. Fetch the file's current content on the thread's `side`.
3. Run `diffLines` (the `diff` npm package — new dependency, MIT licensed,
   does line-level LCS diffing) between the snapshot and current content.
4. If `[lineStart, lineEnd]` maps entirely through unchanged lines in that
   diff, update `lineStart`/`lineEnd` to the mapped position. Not outdated.
5. If any line in the range falls inside a changed region, set
   `outdated: true` (terminal — never reset to `false` automatically).
6. If `pinnedRef === "uncommitted"` and `dirty` has just cleared and a new
   `headSha` exists: re-run the same diff between the snapshot and the
   file's content in the new commit. If unchanged, backfill
   `pinnedRef = headSha` (the comment's uncommitted state just became that
   commit). If changed, mark `outdated` per step 5 instead.

This piggybacks on the existing poll cadence and notification model —
`resolveThread`-style silent state changes, no new notification event type,
since drift/outdated status isn't something an agent needs pushed to it
immediately (confirmed with the user: no urgency for agents to know a
thread went outdated the instant it happens; the next `/api/threads` fetch
picks it up).

## 4. UI

`CommentThread.tsx` gets an "Outdated" badge (same visual family as the
existing pending/acked/seen badges) when `thread.outdated`, with a toggle
to show the original `contentSnapshot` context for the commented range —
mirrors GitHub's "show outdated diff" behavior. Outdated is independent of
`resolved`: a thread can be both, or outdated-but-unresolved.

## Open questions for implementation planning

- Exact `diff` library API surface to depend on (`diffLines` vs a lower-level
  primitive) — confirm during plan-writing once the dependency is added and
  its types are in hand.
- Whether `contentSnapshots` needs eviction/size limits for very long
  sessions on large files — likely fine to defer until it's an observed
  problem, given content is deduped per `(file, pinnedRef)`.
