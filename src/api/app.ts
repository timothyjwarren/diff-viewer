import express from "express";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ViewerTracker } from "./viewerTracker.js";
import { SessionStore, type NewThreadInput } from "../session/sessionStore.js";
import { computeDiff, computeRangeDiff, computeDiffIncludingUncommitted, markUncommittedLines } from "../git/diff.js";
import { listCommits, resolveHeadSha, isDirty, listDirtyFiles } from "../git/gitRepo.js";
import {
  readWorkingTreeFile, readFileAtRef, readWorkingTreeFileOrEmpty, readFileAtRefOrEmpty, linesToContent,
  readFileForView, isSafeRef, isRepoRelativePath,
} from "../git/fileContent.js";
import { listTree } from "../git/tree.js";
import { annotateHtml } from "../git/htmlAnnotate.js";
import { entriesFor, pathspecArgs, matchesScope } from "../scope/scope.js";
import { unchangedFiles, untrackedFiles } from "../scope/unchanged.js";
import type { DiffFile, RepoConfig, ScopeEntry } from "../types.js";

function findRepo(store: SessionStore, repoPath: string) {
  const repo = store.snapshot.repos.find(r => r.path === repoPath);
  if (!repo) throw new Error(`Unknown repo: ${repoPath}`);
  return repo;
}

/** The ref to read for one side of the active range, mirroring computeRangeDiff's resolution. */
function renderedRef(baseRef: string, side: "old" | "new", from?: string, to?: string): string {
  if (side === "new") return to === "uncommitted" ? "working" : to || "HEAD";
  if (!from) return baseRef;
  return from === "uncommitted" ? "HEAD" : `${from}^`;
}

function isScopeEntry(e: unknown, repoPaths: string[]): e is ScopeEntry {
  if (!e || typeof e !== "object") return false;
  const { repoPath, path: p, kind } = e as Record<string, unknown>;
  return typeof repoPath === "string" && repoPaths.includes(repoPath)
    && typeof p === "string" && p !== "" && (p === "." || isRepoRelativePath(p))
    && (kind === "file" || kind === "dir");
}

/**
 * The files to show for one repo and range. With `entries` (a scoped view),
 * git's output is limited to those paths, untracked scoped files are added
 * when the range ends at the working tree, and scoped files with no changes
 * follow as "unchanged" full-contents entries.
 */
async function repoFiles(repo: RepoConfig, from: string | undefined, to: string | undefined, entries: ScopeEntry[] | null): Promise<DiffFile[]> {
  const ps = entries ? pathspecArgs(entries) : [];
  const files = to === "uncommitted" && !from
    ? await computeDiffIncludingUncommitted(repo.path, repo.baseRef, ps)
    : from && to ? await computeRangeDiff(repo.path, from, to, ps) : await computeDiff(repo.path, repo.baseRef, ps);
  if (entries && to === "uncommitted") {
    const shown = new Set(files.map(f => f.newPath));
    files.push(...(await untrackedFiles(repo.path, entries)).filter(f => !shown.has(f.newPath)));
  }
  if (to === "uncommitted") {
    await markUncommittedLines(repo.path, await resolveHeadSha(repo.path), files);
  }
  if (entries) {
    const toRef = to === "uncommitted" ? "uncommitted" : to || await resolveHeadSha(repo.path);
    files.push(...await unchangedFiles(repo.path, entries, files, toRef));
  }
  return files;
}

const lastKnownState = new Map<string, { headSha: string; dirty: boolean }>();

/**
 * `listeningGraceMs` is how long after its last `/api/wait` request ends an
 * agent still counts as listening, covering the gap while `watch` re-arms.
 */
export function createApp(
  store: SessionStore, webDistDir?: string, waitTimeoutMs = 55000, listeningGraceMs = 10000,
  viewers = new ViewerTracker(),
): express.Express {
  const app = express();
  app.use(express.json());

  let openWaits = 0;
  let lastWaitEndedAt = -Infinity;
  const agentListening = () => openWaits > 0 || Date.now() - lastWaitEndedAt < listeningGraceMs;

  // Browsers identify themselves with a per-page `viewer` id on their polls;
  // requests without one (the CLI, curl) are not viewers.
  const viewerId = (req: express.Request) => typeof req.query.viewer === "string" ? req.query.viewer : null;
  const heartbeat = (req: express.Request) => {
    const id = viewerId(req);
    if (id) viewers.heartbeat(id);
  };

  app.get("/api/session", (req, res) => {
    heartbeat(req);
    res.json(store.snapshot);
  });

  // Polled by the browser, so it returns just these small fields rather than the whole snapshot.
  app.get("/api/session/meta", (req, res) => {
    heartbeat(req);
    const { title, description, commentsReplaced, scope } = store.snapshot;
    res.json({ title, description, commentsReplaced, agentListening: agentListening(), scope: scope ?? null });
  });

  // Sent by a page as it closes, so the server can stop soon after the last viewer leaves.
  app.post("/api/session/bye", (req, res) => {
    const id = viewerId(req);
    if (id) viewers.leave(id);
    res.status(204).end();
  });

  app.post("/api/session/reset", async (_req, res) => {
    store.reset();
    await store.persist();
    res.status(204).end();
  });

  app.get("/api/archives", (_req, res) => res.json(store.listArchives()));

  app.post("/api/archives/:archiveId/restore", async (req, res) => {
    try {
      store.restoreArchive(req.params.archiveId);
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
    // The restored threads were last positioned against the code as it was
    // when they were archived; forgetting the known repo state makes the
    // next /api/repo-state poll reposition them against the current code.
    lastKnownState.clear();
    await store.persist();
    res.status(204).end();
  });

  app.put("/api/session/description", async (req, res) => {
    const { description } = req.body as { description?: unknown };
    if (typeof description !== "string") return res.status(400).json({ error: "description must be a string" });
    store.setDescription(description);
    await store.persist();
    res.status(204).end();
  });

  app.put("/api/session/scope", async (req, res) => {
    const { scope } = (req.body ?? {}) as { scope?: unknown };
    const repoPaths = store.snapshot.repos.map(r => r.path);
    const valid = scope === null
      || (Array.isArray(scope) && scope.length > 0 && scope.every(e => isScopeEntry(e, repoPaths)));
    if (!valid) return res.status(400).json({ error: "scope must be null or a non-empty array of { repoPath, path, kind } entries for session repos" });
    store.setScope(scope === null ? null : (scope as ScopeEntry[]).map(({ repoPath, path: p, kind }) => ({ repoPath, path: p, kind })));
    await store.persist();
    res.json({ scope: store.snapshot.scope ?? null });
  });

  /** The scope entries for a repo, or null when the request shows everything (unscoped session, or `all=1`). */
  function requestEntries(req: express.Request, repoPath: string): ScopeEntry[] | null {
    const { scope } = store.snapshot;
    if (!scope || req.query.all === "1") return null;
    return entriesFor(scope, repoPath);
  }

  app.get("/api/diffs", async (req, res) => {
    const session = store.snapshot;
    const results = await Promise.all(session.repos.map(async repo => {
      const entries = requestEntries(req, repo.path);
      return {
        repo: repo.name,
        branch: repo.branch,
        repoPath: repo.path,
        scoped: entries !== null,
        files: entries ? await repoFiles(repo, undefined, "uncommitted", entries) : await computeDiff(repo.path, repo.baseRef),
      };
    }));
    res.json(results);
  });

  app.get("/api/commits", async (req, res) => {
    const { repoPath } = req.query as Record<string, string>;
    try {
      const repo = findRepo(store, repoPath);
      const entries = requestEntries(req, repo.path);
      const commits = await listCommits(repo.path, repo.baseRef, entries ? pathspecArgs(entries) : []);
      const dirty = entries
        ? (await listDirtyFiles(repo.path)).some(f => matchesScope(f, entries))
        : await isDirty(repo.path);
      if (dirty) {
        commits.push({ sha: "uncommitted", shortSha: "uncommitted", subject: "Uncommitted changes", author: "", date: "" });
      }
      res.json(commits);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/repo-diff", async (req, res) => {
    const { repoPath, from, to } = req.query as Record<string, string | undefined>;
    try {
      const repo = findRepo(store, repoPath!);
      // to=uncommitted with no from means "everything, including local
      // edits" (the chooser's "Show all commits + uncommitted changes"),
      // as distinct from a specific from..uncommitted range.
      res.json(await repoFiles(repo, from, to, requestEntries(req, repo.path)));
    } catch {
      res.status(404).end();
    }
  });

  /** Validates the repo/ref/path query shared by /api/file and /api/tree; sends the error response itself. */
  function parseBrowseQuery(req: express.Request, res: express.Response, allowEmptyPath: boolean) {
    const { repoPath, path: relPath = "", ref } = req.query as Record<string, string | undefined>;
    if (typeof repoPath !== "string" || typeof ref !== "string" || typeof relPath !== "string") {
      res.status(400).json({ error: "repoPath, ref and path are required" });
      return null;
    }
    if (!isSafeRef(ref) || !isRepoRelativePath(relPath) || (!allowEmptyPath && relPath === "")) {
      res.status(400).json({ error: "invalid ref or path" });
      return null;
    }
    const repo = store.snapshot.repos.find(r => r.path === repoPath);
    if (!repo) {
      res.status(404).json({ error: "unknown repo" });
      return null;
    }
    return { repo, ref, relPath };
  }

  app.get("/api/file", async (req, res) => {
    const q = parseBrowseQuery(req, res, false);
    if (!q) return;
    try {
      // "working" keeps the raw-disk shape the diff view's expansion relies on.
      if (q.ref === "working") return res.json({ lines: await readWorkingTreeFile(q.repo.path, q.relPath) });
      const result = await readFileForView(q.repo.path, q.ref, q.relPath);
      res.json("lines" in result ? result : { lines: [], skipped: result.skipped });
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/tree", async (req, res) => {
    const q = parseBrowseQuery(req, res, true);
    if (!q) return;
    try {
      const files = await computeDiff(q.repo.path, q.repo.baseRef);
      const changed = new Set(files.map(f => f.newPath || f.oldPath));
      const entries = await listTree(q.repo.path, q.ref, q.relPath, changed);
      res.json({ repoName: `${q.repo.name}:${q.repo.branch}`, entries });
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/rendered", async (req, res) => {
    const { repoPath, path: relPath, side, from, to, scripts } = req.query as Record<string, string | undefined>;
    if (!relPath || path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) {
      return res.status(400).json({ error: "path must be repo-relative" });
    }
    if (side !== "old" && side !== "new") return res.status(400).json({ error: "side must be old or new" });
    try {
      const repo = findRepo(store, repoPath!);
      const ref = renderedRef(repo.baseRef, side, from, to);
      const lines = ref === "working"
        ? await readWorkingTreeFile(repo.path, relPath)
        : await readFileAtRef(repo.path, ref, relPath);
      const html = annotateHtml(lines.join("\n"), {
        scripts: scripts === "1", nonce: randomBytes(16).toString("base64url"),
      });
      res.json({ html });
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/threads", (_req, res) => res.json(store.snapshot.threads));

  app.post("/api/mark-seen", async (_req, res) => {
    store.markAllSeen();
    await store.persist();
    res.status(204).end();
  });

  app.post("/api/threads", async (req, res) => {
    // The client sends everything NewThreadInput needs except pinnedRef (it
    // doesn't know the resolved sha) — toRef in its place, resolved below.
    const { toRef, ...rest } = req.body as Omit<NewThreadInput, "pinnedRef"> & { toRef: string };
    const repo = findRepo(store, rest.repoPath);
    const pinnedRef = toRef === "HEAD" ? await resolveHeadSha(repo.path) : toRef;
    const lines = pinnedRef === "uncommitted"
      ? await readWorkingTreeFileOrEmpty(repo.path, rest.file)
      : await readFileAtRefOrEmpty(repo.path, pinnedRef, rest.file);
    store.ensureContentSnapshot(pinnedRef, rest.file, linesToContent(lines));
    const thread = store.addThread({ ...rest, pinnedRef });
    await store.persist();
    res.status(201).json(thread);
  });

  app.patch("/api/threads/:threadId/resolve", async (req, res) => {
    try {
      store.resolveThread(req.params.threadId, Boolean(req.body.resolved));
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.patch("/api/threads/:threadId/flag", async (req, res) => {
    try {
      store.flagThread(req.params.threadId, Boolean(req.body.flagged));
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/threads/:threadId/comments", async (req, res) => {
    const { author, body, suggestion, pending, createdAt } = req.body;
    try {
      const comment = store.addReply(req.params.threadId, author, body, suggestion, pending, createdAt);
      await store.persist();
      res.status(201).json(comment);
    } catch {
      res.status(404).end();
    }
  });

  app.patch("/api/threads/:threadId/comments/:commentId", async (req, res) => {
    try {
      store.editComment(req.params.threadId, req.params.commentId, req.body.body);
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.delete("/api/threads/:threadId/comments/:commentId", async (req, res) => {
    try {
      store.deleteComment(req.params.threadId, req.params.commentId);
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/threads/:threadId/comments/:commentId/ack", async (req, res) => {
    try {
      store.ackComment(req.params.threadId, req.params.commentId);
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/threads/:threadId/comments/:commentId/read", async (req, res) => {
    try {
      store.markCommentRead(req.params.threadId, req.params.commentId);
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.delete("/api/threads/:threadId/comments/:commentId/ack", async (req, res) => {
    try {
      store.unackComment(req.params.threadId, req.params.commentId);
      await store.persist();
      res.status(204).end();
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/verdicts", (_req, res) => res.json(store.snapshot.verdicts));

  app.get("/api/verdicts/:id", (req, res) => {
    try {
      res.json(store.getVerdictDetail(req.params.id));
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/verdicts", async (req, res) => {
    const verdict = store.addVerdict(req.body.type, req.body.summary);
    await store.persist();
    res.status(201).json(verdict);
  });

  app.get("/api/repo-state", async (req, res) => {
    const { repoPath } = req.query as Record<string, string>;
    try {
      const repo = findRepo(store, repoPath);
      const [headSha, dirtyFiles] = await Promise.all([resolveHeadSha(repo.path), listDirtyFiles(repo.path)]);
      const dirty = dirtyFiles.length > 0;
      const prev = lastKnownState.get(repoPath);
      if (!prev || prev.headSha !== headSha || prev.dirty !== dirty) {
        await store.recomputeThreadPositions(
          repoPath, headSha, dirty,
          (pinnedRef, file) => pinnedRef === "uncommitted"
            ? readWorkingTreeFileOrEmpty(repo.path, file).then(linesToContent)
            : readFileAtRefOrEmpty(repo.path, pinnedRef, file).then(linesToContent),
          // The "old" side is always baseRef's content, which never moves
          // during a session. For the "new" side: a thread pinned to
          // "uncommitted" tracks the working tree (that's its commit basis
          // until it's committed and backfilled to a real sha); a
          // real-sha-pinned thread tracks HEAD only, not the working tree —
          // its canonical position must match the committed-only view
          // exactly, so it only drifts/outdates on an actual commit. Any
          // uncommitted shift is applied separately, per-view, at render
          // time in the client, not folded into this canonical position.
          (file, side, pinnedRef) => {
            if (side === "old") return readFileAtRef(repo.path, repo.baseRef, file).then(linesToContent);
            return (pinnedRef === "uncommitted" ? readWorkingTreeFile(repo.path, file) : readFileAtRef(repo.path, headSha, file))
              .then(linesToContent);
          },
        );
        await store.persist();
        lastKnownState.set(repoPath, { headSha, dirty });
      }
      res.json({ headSha, dirty, dirtyFiles });
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/wait", (req, res) => {
    openWaits += 1;
    res.on("close", () => {
      openWaits -= 1;
      lastWaitEndedAt = Date.now();
    });
    // A cursor past the end of this server's history was saved against an
    // earlier run of the session, so none of these notifications have been
    // seen: replay from the start rather than wait for the count to catch up.
    const requested = Number(req.query.since ?? store.notificationCount);
    const since = requested > store.notificationCount ? 0 : requested;
    const already = store.notificationsSince(since);
    if (already.length > 0) {
      res.json({ notifications: already, cursor: since + already.length });
      return;
    }
    const onClosed = () => {
      clearTimeout(timeout);
      store.emitter.off("notification", onUpdate);
      res.json({ notifications: [], cursor: requested, ended: "viewer_closed" });
    };
    const onUpdate = () => {
      clearTimeout(timeout);
      viewers.emitter.off("closed", onClosed);
      const events = store.notificationsSince(since);
      res.json({ notifications: events, cursor: since + events.length });
    };
    const timeout = setTimeout(() => {
      store.emitter.off("notification", onUpdate);
      viewers.emitter.off("closed", onClosed);
      res.status(204).end();
    }, waitTimeoutMs);
    store.emitter.once("notification", onUpdate);
    viewers.emitter.once("closed", onClosed);
  });

  if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get("/session/:id", (_req, res) => res.sendFile("index.html", { root: webDistDir }));
    app.get("/view-file", (_req, res) => res.sendFile("index.html", { root: webDistDir }));
  }

  return app;
}
