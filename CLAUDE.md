# diff-viewer

## Worktrees

Do all implementation work in a git worktree, never directly on `main`. Merge back to `main` only when asked.

## Versioning

Immediately before pushing to the remote, bump the version number (`package.json`, `package-lock.json`, `.claude-plugin/plugin.json`) in a dedicated commit. Do not bump the version number when working in a worktree.
