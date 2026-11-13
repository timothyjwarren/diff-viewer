# File browser for non-diff files

## Intent

While reviewing a diff, the reviewer often needs a file the diff doesn't touch: a utility the changed code calls, a type it relies on. They want to read that file as it was at the reviewed commit, comment on its lines, and ask the agent how it relates to the change. Today the viewer's read-only "view file" page opens only files already in the diff and has no comments.

## Goals

- Browse any directory and file of a session repo at a fixed commit, starting from a path in a diff file header.
- Comment on lines of any viewed file, with the same composer, threads and agent delivery as diff comments.
- Let an agent generate a direct link to a file (optionally a line) or directory, so the user can say "link me to where `Foo` is defined".
- Surface threads on non-diff files in the main diff's thread list.

## Non-goals

- Editing files; blame, history or diff-against-other-ref inside the browser.
- Search, fuzzy file finding, symbol navigation.
- Switching the ref from within the browser. The ref is fixed per page.
- Following renames between refs.

## Anti-goals

- The existing "view file" button in diff file headers keeps working and keeps opening a file view.
- Comments made in the browser need no new agent-side concept: the agent reads them through `review` like all others.

## Behavior

### Route and URL

The `/view-file` page becomes the browser. Query parameters: `repoPath`, `ref`, `path` (repo-relative; a file or a directory; empty = repo root), optional `line` (1-based, scrolls to and highlights that line). `ref` is a commit sha, or `uncommitted` for the working tree. The page header shows the repo name (derived server-side from `repoPath`), the path and the ref.

### Layout

A tree sidebar on the left and a file pane on the right.

- The tree lazily loads one directory per request and is expanded down to `path` (if `path` is a file, down to its parent, with the file selected and open).
- Files that the session's diff changes are marked "diff".
- Clicking a file opens it in the file pane and updates the URL (`path`, clearing `line`) without a full reload.
- If `path` is a directory, the file pane shows an empty state until a file is chosen.
- The file pane is the existing highlighted line view (shiki), extended with commenting.
- Binary files and files over a size cap show a placeholder instead of content.

### Entry points

1. **Header path segments.** In a diff file header, each directory segment of the path is a link. Clicking one opens the browser in a new tab at that directory and the diff's current "to" ref (the diff HEAD sha, or `uncommitted`). The final filename segment keeps opening that file.
2. **Agent links.** `diff-viewer link <sessionId> <path>[:line] [--repo <repoPath>]` prints a full URL to the running viewer. The ref is the repo's current HEAD sha, i.e. the diff HEAD. `--repo` is required only when the session has several repos and the path is ambiguous. A trailing `/` or a directory path produces a directory link. `commands/review.md` documents the command so agents use it when asked to link to code.

### Comments

- Clicking a line number (shift-click for a range) opens the existing composer. Posting calls the existing `POST /api/threads` with `side: "new"` and `toRef` = the page's `ref`.
- Threads are shown inline in the file pane, with resolve, flag, edit, delete and replies, and update live like the main app.
- Threads on a committed ref are pinned to that sha and follow the existing drift tracking toward current HEAD. A thread on `uncommitted` follows the existing uncommitted behavior.
- Drift tracking stores a thread's lines as positions in the current HEAD content, while `pinnedRef` stays the original sha. So the page shows a file's threads inline only when its `ref` is the repo's current HEAD sha (or `uncommitted` while the working tree is the basis). At any other ref it shows no threads and instead shows a banner: "N threads on this file are anchored to a newer version", with a link that opens the same path at current HEAD. The banner counts the file's non-outdated threads. Commenting at an older ref still works; those threads are then tracked as usual.
- "Other files" entries always link to the browser at the current HEAD (or `uncommitted`), at the thread's current line, never at the thread's `pinnedRef`.

### Thread list in the main diff

The main diff's thread listing has an "Other files" section for threads whose file is not in the diff. Each entry shows file and line, and links to the browser at that file and line (ref rules under Comments).

## Server

- `GET /api/tree?repoPath&ref&path` returns the entries of a directory at `ref` (`git ls-tree` for a commit, directory read for `uncommitted`): name, type (file or dir), and for files whether the diff changes it.
- `GET /api/file` (existing) applies the same validation `/api/rendered` does: `repoPath` is a session repo, `path` is repo-relative with no `..`.
- All new and extended endpoints reject refs starting with `-`, as `readFileAtRef` does.
- A missing path or ref returns 404; the page shows a not-found state.

## Calls made by the author (not the user)

- The route stays `/view-file`; no new route.
- "diff" markers come from the session's default diff for the repo.
- The `link` command pins to the repo's HEAD sha.
- `uncommitted` is the ref name in URLs and API calls; `GET /api/file` accepts `uncommitted` as well as its existing `working`.
- A browser thread on a file that is also in the diff is the same thread as any other: it also renders inline in the diff. The "Other files" section lists threads whose file is not in the current diff, evaluated live.
- `diff-viewer link` checks that the path exists at the HEAD sha and exits with an error if not, so an agent never hands out a dead link.
- The tree's "diff" marker also appears on directories that contain changed files, so collapsed directories hint where to look.
- Size cap and binary detection thresholds are left to the builder.

## Left to the builder

- Component structure, and how the browser page loads and live-updates threads (reuse what `App` does).
- Where the "Other files" section sits within the existing thread listing UI.
- Keyboard and styling details, consistent with the existing viewer.
