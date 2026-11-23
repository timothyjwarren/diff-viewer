# Resuming a stopped session in place

## Intent

A long review can outlive its server: the agent stops it, or it exits after
the viewer goes idle. The reviewer wants the agent to bring that same session
back so the browser tab they already have open picks up exactly where they
were — current file, scroll position, selected range, drafts — instead of
starting a new session and re-navigating.

## How it works

The open viewer tab keeps polling a server that has gone away and shows a
"Lost connection" notice until it answers again; its in-memory position is
never discarded. A server that comes back under the same session id on the
same port is therefore indistinguishable, to that tab, from one that never
left. Comments, verdicts and the notification log live in the session's data
file, so the agent's `watch` cursor stays valid too.

## Goals

- `diff-viewer resume <sessionId>` restarts a stopped session under its own
  id, loading its data file unchanged, on the port it last bound.
- An open tab on that session reconnects with no user action.
- Clear failure when the session is still running, has no data file, or its
  port is taken.

## Non-goals

- Persisting the viewer's position for a tab that was closed.
- Changing how `--import-session` works.

## Approaches

- **Resume on the saved port (chosen).** The existing tab reconnects and keeps
  its place; the only new state is the port.
- Import into a new session (today's behavior): loses the reviewer's place.
- Persist the viewer position server-side and restore it in a new tab: more
  work, and only needed when the tab is gone.

## Design

- The session data file records the port the server bound (`port`), written
  once the server is listening.
- The server accepts `--resume <sessionId>`: it loads the existing data file
  (`SessionStore.load`), keeps its id, repos, scope and comments, marks it
  active, and listens on the saved port. Repo and `--files` arguments are not
  accepted with `--resume`.
- `diff-viewer resume <sessionId> [--any-port]`:
  - errors if the session's registry entry points at a live process
    ("already running" with its URL);
  - errors if no data file exists;
  - otherwise starts the server like `start` does and prints the same
    `{ sessionId, port, url }` JSON;
  - if the saved port is in use, fails with a message naming the port and
    suggesting `--any-port`, which binds an OS-chosen port (new URL, same
    session).
- The review skill tells the agent to offer `resume` first when a session has
  ended and the user wants to continue, falling back to `--import-session`.

## Left to the builder

Exact flag plumbing, how a stale registry entry (dead pid) is cleaned up, and
how sessions created before `port` was recorded are handled (they resume on
`--any-port` behavior with a note).
