# File scope for a review session

## Intent

An agent often wants the user to look at a few specific files, in isolation from the rest of the branch. A driving case: the agent writes a script that the user will run with elevated permissions, and the user wants to read exactly that code before running it. Whether the code is committed doesn't matter to the user, and it may get committed partway through the review. Some scoped files have edits, some are untouched. Today a session shows every changed file in its repos and nothing else. `diff-viewer link` opens one unchanged file at a time in the file browser of a session that is already running.

A session can carry a **file scope**: a list of paths. While a session has a scope, the viewer shows exactly those files, whatever their git state:

- a scoped file with changes in the current range shows its diff
- a scoped file with no changes shows its full contents, marked "unchanged", and its lines can be commented on

A scoped session's default range includes uncommitted changes, so a file the agent has edited shows its diff whether or not it has been committed. Committing it changes nothing the user sees.

## Goals

- `diff-viewer start --files <path>...` starts a session scoped to those paths.
- `diff-viewer scope <sessionId> <path>...` replaces the scope of a running session, and `diff-viewer scope <sessionId> --clear` removes it. An open viewer picks up the change within a few seconds, as it does for `describe`.
- The scope is saved in the session file, so it survives a server restart and carries over with `--import-session`.
- The main view, the files bar, the file counts and the commit picker all cover only the scope.
- A "Show all changed files" toggle in the viewer turns the filter off, so the scope never hides a change the user needs to see.
- The user is never left reading a stale version of a scoped file: when its contents change after the page loaded, the viewer says so.

## Non-goals

- Glob patterns. Scope entries are files and directories.
- Editing the scope from the browser. The agent owns it, as it owns the description.
- Listing every unchanged file under a scoped directory.

## Anti-goals

- A scoped file that gets committed must not disappear from view, change how it is shown, or move to a different page or tab.
- The viewer must not silently show older contents of a scoped file than what is on disk.
- An unscoped session behaves exactly as it does now.
- Comments on scoped files need no new concept on the agent side. The agent reads them through `review` like every other comment.

## Approaches

- **A. Saved scope with one combined view (chosen).** The scope is stored on the session. Every diff the viewer requests is limited to the scope, and scoped files with no changes are added to the same list as full-file entries. There is one place to look, and it holds up across commits. The diff view needs a new case: a file with no changes, rendered as its whole contents.
- **B. Saved scope, unchanged files in the file browser.** Same scope, but unchanged files appear in a sidebar section that opens each one in the browser tab. This needs less new rendering, but changed and unchanged files are read in different places, and a file moves between them when it is committed.
- **C. Two independent flags.** `--files` filters the diff, and a separate `--open` launches the browser on files. Nothing ties them together, so the agent has to guess which one the user wants, and committing a file changes where it shows up.

The user chose A, with the `scope` command and the "Show all changed files" toggle.

## Behavior

### Scope entries

- `start --files` takes one or more paths, which run up to the next `--` flag or the first repo argument. Paths are absolute or relative to the CLI's working directory. `scope` takes paths the same way.
- Each path is resolved to an absolute path and assigned to the session repo that contains it (the deepest repo path, if repos are nested). A path inside no session repo is an error, and `start`/`scope` fails, naming the path.
- A path must exist at the repo's HEAD or in its working tree, or be in the diff, when it is added. Otherwise the command fails, naming the path. This catches typos. A scoped file that is deleted later stays in scope and shows as a deletion in the diff.
- A path that is a directory (or ends in `/`) is a **directory entry**. Every file path is a **file entry**.
- The session stores the scope as `scope: Array<{ repoPath: string; path: string; kind: "file" | "dir" }> | null`. `path` is repo-relative, and `"."` stands for a repo root. `null` means unscoped. An empty array never occurs: `--clear` sets `null`.

### Default range

An unscoped session's default view diffs `baseRef..HEAD`, committed changes only, and pins comments to the HEAD sha. A scoped session instead opens every repo on the commit picker's existing "Show all commits + uncommitted changes" range (`to: "uncommitted"`, no `from`): `git diff <baseRef>` against the working tree, with comments using `toRef: "uncommitted"` and the existing uncommitted pinning and drift tracking. This applies whether or not the repo is dirty, so a commit made mid-review doesn't change the range. The user can still pick any other range in the commit picker. With the toggle on, the default is the unscoped one.

### What the viewer shows

For each repo, when the session has a scope and the toggle is off:

1. **Changed files**: the files in the current diff (whatever range the commit picker has selected) whose new or old path equals a file entry or falls under a directory entry of that repo.
2. **Unchanged files**: file entries of that repo that aren't in step 1's list. Each one is an entry with status `"unchanged"` and the file's full contents at the range's "to" ref: the working tree for `uncommitted` (the scoped default), or the commit for a specific range. A file that doesn't exist at that ref is left out of the list. Comments on these use the same `toRef` as diff comments in that range.
3. Directory entries contribute only through step 1. Unchanged files under a scoped directory are not listed.

Files appear in diff order, followed by the unchanged files in the order they were given.

A repo with no scope entries shows no files while the session is scoped. This is my call: an agent that scopes a multi-repo session to files in one repo means "only these". The toggle shows everything.

### Unchanged file entries

- The server returns them as `DiffFile` objects with `status: "unchanged"`, `oldPath === newPath`, and one hunk whose lines are all `context`, numbered 1..N on both sides. The viewer reuses its existing rendering, comment selection and thread placement with no special path for comments.
- The file header shows an "unchanged" badge in place of the add/delete counts.
- Expand strips, the rendered HTML view and the "view file" button work as they do for any file. If the rendered view assumes an old and a new side differ, it shows the same version on both sides. That's left to the builder.
- Binary files and files over the file browser's size cap show the browser's placeholder.
- Comments use `side: "new"` and the same `toRef` as any diff comment in that range, so drift tracking and `review` output need no changes.

### Commit picker

While scoped, the commit list includes only commits that touch a scoped path (`git log <base>..HEAD -- <paths>`). The "Uncommitted changes" entry appears only if a scoped path is dirty. With the toggle on, the commit picker shows every commit, as it does now.

### The toggle

- "Show all changed files" appears at the top of the sidebar's file list, only when the session has a scope.
- Off by default. When it's on, the viewer requests unfiltered diffs and commit lists, and unchanged scoped files aren't listed, so the view is exactly an unscoped session.
- The toggle's state is per browser tab and isn't saved. A reload starts with the scope on.
- When the session is scoped, the sidebar's file-list heading shows "Scoped to N paths". Its tooltip lists the paths. The exact wording is left to the builder.

### Changing the scope mid-session

- `GET /api/session/meta` includes `scope`. When the viewer's 3-second poll sees a different value, it reloads the diffs and commit lists for every repo, keeping each repo's selected range when that range's commits are still in the new list, and resetting it otherwise.
- A user who is mid-comment when the scope changes keeps their open composer. Reloading must not discard an unsent draft. If the composer's file has left the view, the builder decides what happens to the draft, but it must not be silently lost.

### Stale contents

The viewer loads diffs once and otherwise never reloads them on its own. While scoped, it detects when a shown file's contents have changed since it was loaded:

- `GET /api/repo-state` (already polled every 3 seconds) returns a content fingerprint per scoped path at the current range's "to" ref (a git blob hash of the working-tree file, or the sha at a commit; `null` for a missing file). The viewer keeps the fingerprints it loaded with.
- When a fingerprint differs, that file's header shows "Changed since you loaded it" with a **Reload** button. Reload refetches that repo's diff, keeping the selected range. The notice stays until the user reloads, and it isn't dismissable any other way.
- A file that newly enters the diff, or leaves it, also counts as a change for the repo, and the notice appears at the top of that repo's file list.
- A commit that only moves already-shown working-tree content into HEAD doesn't change the fingerprint under the scoped default range, so it raises no notice.

### Threads outside the scope

A thread whose file isn't shown (out of scope, or scoped but missing at the ref) appears in the sidebar's existing "Other files" section, exactly as threads on non-diff files do now.

## Server

- `SessionData.scope` (described above), persisted with the rest of the session. Old session files without the field load as `scope: null`.
- `SessionStore.importFrom` keeps the source's scope unless the new `start` passes `--files`, in which case the new scope wins. A carried-over entry whose `repoPath` isn't a new session repo is remapped to the new repo with the same name (`basename`), when exactly one matches. Unmatched entries are dropped, with a warning on stderr naming them. If no entries remain, the scope is `null`. (My call: resuming a review from another worktree of the same repo is the likely case.)
- `GET /api/diffs` and `GET /api/repo-diff` apply the scope unless the request carries `all=1`. They filter git's output by passing the scope's paths as a pathspec after `--`, and then add the unchanged file entries.
- `GET /api/commits` applies the scope unless `all=1`.
- `PUT /api/session/scope` replaces the scope with the body `{ scope: [...] | null }`. The CLI resolves and validates the paths before calling it, and the server checks again that each `repoPath` is a session repo and each `path` is repo-relative (`isRepoRelativePath`).
- `GET /api/session/meta` returns `scope`.
- `GET /api/repo-state` takes the current `to` ref and returns scoped-path fingerprints (see Stale contents).

## CLI and agent docs

- `start --files <path>...`, as described above.
- `scope <sessionId> <path>...` and `scope <sessionId> --clear` print `{"scope": [...]}` or `{"scope": null}`.
- `sessions` output includes each session's scope.
- The README command table documents `--files` and `scope`.
- `commands/review.md` tells agents when to use a scope: when the user asks to look at specific files, or the agent wants the user to vet code before running it, start with `--files` and don't use one `link` per file. When the review narrows or widens, update the scope with `scope`. `link` stays the way to point at one file or line on a running session.

## Left to the builder

- How `--files` ends in the argument list for `start`, and whether `--files` may be repeated. It must be unambiguous with the positional repo arguments.
- How the unchanged-file list is computed efficiently (`git ls-files`/`cat-file` versus reading files one by one).
- The exact wording and placement of the toggle, the "unchanged" badge and the scope heading, in the style of the existing sidebar.
