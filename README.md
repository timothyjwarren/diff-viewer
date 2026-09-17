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
line per notification and exits on its own once the session is stopped.
`diff-viewer wait` is the one-shot primitive `watch` loops on; it resolves
once, on the next notification, and is meant for scripting rather than
Monitor.

| Command | Purpose |
|---|---|
| `diff-viewer start [--title <text>] <path[:baseRef]>...` | Start a session; prints `{sessionId, port, url}`. `--title` sets the browser tab title (defaults to `repo:branch`, or a summary for multiple repos) -- pick something that distinguishes this session among other concurrent diff-viewer tabs. |
| `diff-viewer watch <sessionId>` | Loops indefinitely, printing one JSON line per comment/verdict notification; built for `Monitor`. |
| `diff-viewer wait <sessionId>` | Long-polls until the next single comment or verdict, then exits. |
| `diff-viewer review <sessionId>` | Prints all comment threads and verdicts (with computed intent) as JSON. |
| `diff-viewer reply <sessionId> <threadId> <text>` | Post an agent reply into a thread. |
| `diff-viewer comment <sessionId> <repoPath> <file> <lineStart> <lineEnd> <old\|new> <text>` | Post a new agent-authored comment (e.g. from `/code-review`). |
| `diff-viewer ack <sessionId> <threadId> <commentId>` / `unack ...` | Move a single, immediately-posted comment's status from the automatic "seen" indicator (set the moment `diff-viewer review` reads it) to a pulsing "agent is working on this" indicator, then to a cleared/no-badge state once `unack` runs -- a one-way seen -> acked -> cleared progression, never reverting. |
| `diff-viewer sessions [--repo <path>]` | List active sessions, optionally filtered to ones covering a given repo. |
| `diff-viewer stop <sessionId>` | Shut down a session's server. |

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

For development:

```bash
npm install            # server/CLI deps
cd web && npm install  # frontend deps

npm test                # server/CLI tests (vitest)
cd web && npm test      # frontend tests (vitest + @testing-library/react)

npm run build            # compiles TS (tsc) and builds the frontend (vite build)
```

Full architecture and design rationale:
[`docs/superpowers/specs/2026-09-16-diff-viewer-design.md`](docs/superpowers/specs/2026-09-16-diff-viewer-design.md).
