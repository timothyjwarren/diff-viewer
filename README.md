# diff-viewer

You ask Claude Code to make a round of changes across a few repos, or a
couple of worktrees on the same repo. Now you want to look everything over
before it goes further -- but there's no PR yet, so GitHub can't help, and
flipping through diffs in the terminal across multiple repos means losing
track of what you've already looked at and what you still want to comment
on. Meanwhile the agent is just sitting there waiting for you to say
something.

**diff-viewer** is a local, GitHub-PR-style review UI for exactly this
moment. One click and you get a side-by-side diff across every repo and
worktree involved, in your browser, while the agent stays live in your
chat. Leave a quick question inline and get an answer without breaking
your flow, or queue up a full review and submit it -- Comment, Approve, or
Request Changes -- and the agent picks it up automatically, no need to
tell it you're done.

## Benefits

- **Review everything at once.** Changes to three repos and a side
  worktree show up as one sequential list of files, not three separate
  terminal sessions.
- **Ask without derailing.** An inline comment is just a question to the
  agent -- it answers and keeps working, instead of treating it as a
  change request.
- **Queue a real review.** Select lines, add comments to the review, then
  submit Comment / Approve / Request Changes -- only "Request Changes"
  tells the agent to actually go fix something.
- **The agent finds out on its own.** No "hey I'm done, go check" -- it's
  notified the moment you submit or leave a comment.
- **Nothing to sign into.** Runs on `127.0.0.1`, no accounts, no external
  services.

## Installation

This repo is its own plugin marketplace. Add it, then install from it:

```
/plugin marketplace add timothyjwarren/diff-viewer
/plugin install diff-viewer@diff-viewer
```

For local development, point Claude Code at the repo directory directly
as a local plugin instead (see the [Claude Code plugin
docs](https://code.claude.com/docs/en/plugins) for adding a local plugin
path).

Either way, once installed you get one new slash command,
`/diff-viewer:review`, plus a `diff-viewer` CLI command -- nothing to put
on `PATH` yourself. The plugin's `bin/diff-viewer` is added to the
agent's `PATH` automatically while it's enabled; the first time it runs
it installs dependencies and builds (a few seconds, once), and every run
after that is instant.

## Usage

```
/diff-viewer:review [path[:baseRef]] [path[:baseRef]] ...
```

- No arguments -- reviews the current working directory.
- Multiple paths -- reviews several repos/worktrees in one session.
- `path:baseRef` -- override the diff base for that repo (defaults to the
  merge-base with its detected default branch):

  ```
  /diff-viewer:review /repo/a /repo/b:side-branch
  ```

The agent starts the server, opens the viewer in your browser, and keeps
listening in the background -- just keep talking to it. Select a line
range in the gutter (click for one line, click-and-drag for a range) to
comment, or use the review bar at the bottom to submit Comment / Approve /
Request Changes.

HTML files get a **Rendered** view alongside the source view: old and new
versions side by side with the changed elements outlined. Click an element
to comment on it; comments attach to source lines in both views. The page's
own scripts don't run unless you tick **Run scripts** for that file.

**Inline comment** (posted immediately) is always a question or
discussion -- never a request for changes. **Add to review** queues the
comment until you submit; only a **Request Changes** verdict tells the
agent the bundled comments are work to do. Comment and Approve are
discussion, even with comments attached.

## Configuration

Nothing to set up for normal use -- it's all driven through the slash
command and the browser. Two things are configurable if you need them:

- `DIFFVIEWER_HOME` -- where session state lives (defaults to
  `~/.diff-viewer`). Sessions are persisted as JSON here, so they're
  inspectable and survive a server restart.
- The `path:baseRef` syntax described above, per repo, per session.

## Technical details

The plugin has three parts: a Node/TypeScript + Express server (one
process per review session, bound to `127.0.0.1`), a bundled `diff-viewer`
CLI that's the agent's only interface to it (via Bash), and a React/Vite
frontend served as static assets by that same server.

`bin/diff-viewer` is a thin wrapper that execs into `dist/bin/diff-viewer.js`.
Claude Code adds a plugin's `bin/` directory to the agent's `PATH`
automatically while it's enabled, so the CLI is invokable as a bare
command (`diff-viewer ...`) with no global npm link step. `dist/` is
gitignored; the wrapper installs dependencies and runs `npm run build`
the first time it's called if `dist/` doesn't exist yet, then runs
normally on every call after that.

There's no websocket layer -- the browser polls for new comments, and the
agent's live notifications come from `diff-viewer watch`, a long-polling CLI
command meant to run under Claude Code's `Monitor` tool (`persistent: true`)
so the agent is woken up automatically every time something happens, for the
life of the review session, without any new tool surface. It prints one JSON
line per notification and exits on its own once the session is stopped or
every browser viewer has closed (see below).
`diff-viewer wait` is the one-shot primitive `watch` loops on; it resolves
once, on the next notification, and is meant for scripting rather than
Monitor.

| Command | Purpose |
|---|---|
| `diff-viewer start [--title <text>] [--description <markdown>] [--port <n>] [--import-session <sessionId>] [--files <path>... --] <path[:baseRef]>...` | Start a session; prints `{sessionId, port, url}`. `--title` sets the browser tab title (defaults to `repo:branch`, or a summary for multiple repos) -- pick something that distinguishes this session among other concurrent diff-viewer tabs. `--description` sets the session description (see `describe`). `--files` scopes the session to those paths, and the repo paths may then be left out. `--port`, `--import-session` and `--files` are described below. |
| `diff-viewer scope <sessionId> <path>...` / `scope <sessionId> --clear` | Replace a running session's file scope, or remove it. Prints `{"scope": [...]}` or `{"scope": null}`. An open viewer picks up the change within a few seconds. |
| `diff-viewer describe <sessionId> <markdown>` | Set the session description: a brief Markdown overview of what is under review and what the review is for. The title in the sidebar expands to show it, and an open viewer picks up changes within a few seconds. |
| `diff-viewer watch <sessionId>` | Loops indefinitely, printing one JSON line per comment/verdict notification; built for `Monitor`. |
| `diff-viewer wait <sessionId>` | Long-polls until the next single comment or verdict, then exits. |
| `diff-viewer review <sessionId>` | Prints all comment threads and verdicts (with computed intent) as JSON. |
| `diff-viewer reply <sessionId> <threadId> <text> [--author <user\|agent>] [--created-at <iso8601>] [--pending]` | Post a reply into a thread. The three flags are described below. |
| `diff-viewer comment <sessionId> <repoPath> <file> <lineStart> <lineEnd> <old\|new> <text> [--author <user\|agent>] [--created-at <iso8601>] [--pending]` | Post a new comment (e.g. from `/code-review`). The three flags are described below. |
| `diff-viewer link <sessionId> <path>[:line] [--repo <repoPath>]` | Print `{"url": …}`, a link that opens the file (at `line`) in the viewer's file browser as of the repo's current HEAD. A trailing `/` (or `.` for the repo root) links a directory. `--repo` is needed only when the session has several repos. Fails if the path isn't at HEAD. |
| `diff-viewer ack <sessionId> <threadId> <commentId>` / `unack ...` | Move a single, immediately-posted comment's status from the automatic "seen" indicator (set the moment `diff-viewer review` reads it) to a pulsing "agent is working on this" indicator, then to a cleared/no-badge state once `unack` runs -- a one-way seen -> acked -> cleared progression, never reverting. |
| `diff-viewer reset <sessionId>` | Clear every comment thread (including the user's pending, unsubmitted ones) and verdict in the session, keeping its title and description. The cleared comments are archived in the session file. An open viewer clears its comments and shows a notice. |
| `diff-viewer archives <sessionId>` | List the session's archives as JSON: `id`, `archivedAt`, and thread/comment/verdict counts. |
| `diff-viewer restore <sessionId> <archiveId>` | Bring an archive's comments and verdicts back. The comments it replaces are archived first, so a restore can itself be undone. |
| `diff-viewer sessions [--repo <path>]` | List active sessions with their repos and file scope, optionally filtered to ones covering a given repo. |
| `diff-viewer stop <sessionId>` | Shut down a session's server. |
| `diff-viewer resume <sessionId> [--port <n> \| --any-port]` | Restart a stopped session in place, on the port it last bound; prints `{sessionId, port, url}`. Described below. |

### Shutting down when no viewer is open

Open pages heartbeat by polling the server and send a goodbye as they close.
The server shuts itself down once no viewer remains: 90 seconds after the last
heartbeat (10 seconds after a goodbye, so a reload doesn't count as closing),
or 10 minutes after starting if no browser ever connected. `start` accepts
`--first-connect-timeout <seconds>` and `--idle-timeout <seconds>` to change the
10-minute and 90-second windows. Held-open `watch`/`wait` calls end with
`{"type":"session_ended","reason":"viewer_closed"}`, and `diff-viewer review`
keeps working afterwards by reading the saved session, so the agent can bring
unanswered comments back to the user.

### `--port`

Normal use never needs this -- `start` binds to an OS-assigned ephemeral
port by default, which is what `sessions` and the printed `url` are for.
Pass `--port <n>` only when something external needs a fixed, predictable
port (e.g. a script or bookmark pointing at a specific address). If that
port is already in use, `start` fails immediately with `port <n> is
already in use` instead of silently picking a different one.

### Resuming a stopped session: `resume`

`diff-viewer resume <sessionId>` restarts a session whose server has stopped
(by `stop`, or after its viewers went idle), under its own id and with its
comments, verdicts, scope and notification log unchanged. It binds the port
the session last bound, so a browser tab still open on the session's URL
reconnects within a few seconds and keeps its place: the current file,
scroll position, selection and drafts. A `watch` started afterwards picks up
from the same notification log.

- A session whose file records no port fails with a message naming the two
  ways forward: `--port <n>` resumes on that port (take it from the open
  tab's URL), and `--any-port` resumes on a port the OS picks.
- If the port is already in use, `resume` fails and suggests `--any-port`.
  `--any-port` gives the session a new URL, so open it in a new tab.
- A session that is still running fails with `already running` and its URL.
  A leftover registry entry from a server that crashed is cleared and the
  session resumes.
- `--title` and `--description` are not taken; use `describe` once it runs.

### `--import-session`

To continue a stopped session, use `resume`. `--import-session <sessionId>`
is for starting a new session instead: it seeds a brand-new session (its
own id, port, and URL) with another
session's comment history -- every thread, comment, and verdict, with
original authors and timestamps intact -- while resolving `repos` fresh
against the current working tree. The source session's file is only read,
never written, so this is safe even if the source session is still running.
Reach for it when you want a fresh session that carries the prior
discussion over.

### Scoping a review to specific files: `--files` and `scope`

`start --files <path>...` limits the session to those paths, whatever their
git state. The paths are absolute or relative to the current directory, and
run up to the next `--` flag (a bare `--` ends the list, so repo paths can
follow it). Without repo paths, the session covers the repos that contain
the files. Each path must exist in the working tree, at HEAD or at the diff
base; a directory scopes every changed file under it.

While a session is scoped:

- A scoped file with changes shows its diff, and one with no changes shows
  its full contents, marked "unchanged", with lines you can comment on. A
  new untracked file shows as added.
- The default range is "all commits + uncommitted changes", so committing a
  scoped file mid-review changes nothing on screen.
- The commit picker lists only commits that touch a scoped path.
- "Show all changed files" in the sidebar turns the scope off for that
  browser tab.
- When a scoped file changes on disk after the page loaded, its header says
  "Changed since you loaded it", with a Reload button.

`diff-viewer scope <sessionId> <path>...` replaces the scope of a running
session, and `--clear` removes it. The scope is saved with the session and
carries over with `--import-session`: an entry whose repo isn't in the new
session moves to the repo with the same directory name, or is dropped with a
warning.

### `--author` / `--created-at` / `--pending`

Normal use never needs these either -- a plain `comment` or `reply` is
always agent-authored, timestamped now, and posted immediately. They exist
so an agent can manually reconstruct a session's comment history from
another source of truth (e.g. rebuilding state from a transcript): `--author
user` posts as if the user wrote it, `--created-at <iso8601>` backdates it,
and `--pending` queues it as an unsubmitted review comment instead of
posting immediately (only meaningful together with `--author user` -- an
agent-authored comment is never pending).

### Invoking it correctly

`<path[:baseRef]>`'s trailing paths are positional filesystem paths, not a
natural-language description -- passing prose (e.g. a whole user request)
where a path is expected turns each word into its own invalid repo path.
`start` validates every path up front and fails fast with a specific reason
(`Not a directory: ...` / `Not a git repository: ...` / `No such directory:
...`) instead of hanging until the client's 5s startup timeout, so a bad
invocation is diagnosable from its own output.

`baseRef` accepts any git ref, including a bare commit SHA -- not just a
branch name. The default diff (no `baseRef` given) is against the
merge-base of the current branch and its default branch, which is empty if
the changes were committed straight to the default branch with no
divergence. To review an explicit commit range in that case, pass the
*parent* of the range as the baseRef: `/repo:abc1234` diffs everything after
`abc1234`, and also seeds the in-app commit picker with that range.

Each session binds to its own random port, so `start`'s printed URL is
always unique -- a browser tab showing a different repo or stale content is
a leftover tab from an unrelated session, not this one failing to navigate.
`diff-viewer sessions` (no `--repo` filter) lists everything currently
running if that needs confirming.

### Developing

```bash
npm install            # server/CLI deps
cd web && npm install  # frontend deps

npm test                # server/CLI tests (vitest)
cd web && npm test      # frontend tests (vitest + @testing-library/react)

npm run build            # compiles TS (tsc) and builds the frontend (vite build)
```

In a working checkout, rerun both `npm install`s and `npm run build` after
pulling. `bin/diff-viewer` installs dependencies only when a `node_modules/`
directory is missing entirely, and builds only when `dist/` is missing, so
an existing checkout keeps running its old build -- and tests fail on any
newly added dependency -- until you do. Installed copies of the plugin
don't need this: each version is installed into its own directory, which
starts without `node_modules/` or `dist/`.

Full architecture and design rationale:
[`docs/superpowers/specs/2026-09-16-diff-viewer-design.md`](docs/superpowers/specs/2026-09-16-diff-viewer-design.md).
