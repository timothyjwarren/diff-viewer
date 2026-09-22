import express from "express";
import { SessionStore, type NewThreadInput } from "../session/sessionStore.js";
import { computeDiff, computeRangeDiff, computeDiffIncludingUncommitted, markUncommittedLines } from "../git/diff.js";
import { listCommits, resolveHeadSha, isDirty, listDirtyFiles } from "../git/gitRepo.js";
import { readWorkingTreeFile, readFileAtRef, linesToContent } from "../git/fileContent.js";

function findRepo(store: SessionStore, repoPath: string) {
  const repo = store.snapshot.repos.find(r => r.path === repoPath);
  if (!repo) throw new Error(`Unknown repo: ${repoPath}`);
  return repo;
}

const lastKnownState = new Map<string, { headSha: string; dirty: boolean }>();

export function createApp(store: SessionStore, webDistDir?: string, waitTimeoutMs = 55000): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/api/session", (_req, res) => res.json(store.snapshot));

  app.get("/api/diffs", async (_req, res) => {
    const session = store.snapshot;
    const results = await Promise.all(session.repos.map(async repo => ({
      repo: repo.name,
      branch: repo.branch,
      repoPath: repo.path,
      files: await computeDiff(repo.path, repo.baseRef),
    })));
    res.json(results);
  });

  app.get("/api/commits", async (req, res) => {
    const { repoPath } = req.query as Record<string, string>;
    try {
      const repo = findRepo(store, repoPath);
      const commits = await listCommits(repo.path, repo.baseRef);
      if (await isDirty(repo.path)) {
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
      const files = to === "uncommitted" && !from
        ? await computeDiffIncludingUncommitted(repo.path, repo.baseRef)
        : from && to ? await computeRangeDiff(repo.path, from, to) : await computeDiff(repo.path, repo.baseRef);
      if (to === "uncommitted") {
        await markUncommittedLines(repo.path, await resolveHeadSha(repo.path), files);
      }
      res.json(files);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/file", async (req, res) => {
    const { repoPath, path: relPath, ref } = req.query as Record<string, string>;
    const lines = ref === "working"
      ? await readWorkingTreeFile(repoPath, relPath)
      : await readFileAtRef(repoPath, ref, relPath);
    res.json({ lines });
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
      ? await readWorkingTreeFile(repo.path, rest.file)
      : await readFileAtRef(repo.path, pinnedRef, rest.file);
    store.ensureContentSnapshot(pinnedRef, rest.file, linesToContent(lines));
    const thread = store.addThread({ ...rest, pinnedRef });
    await store.persist();
    res.status(201).json(thread);
  });

  app.post("/api/threads/:threadId/comments", async (req, res) => {
    const { author, body, suggestion, pending } = req.body;
    try {
      const comment = store.addReply(req.params.threadId, author, body, suggestion, pending);
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
            ? readWorkingTreeFile(repo.path, file).then(linesToContent)
            : readFileAtRef(repo.path, pinnedRef, file).then(linesToContent),
          // The "old" side is always baseRef's content, which never moves
          // during a session — only "new"-side threads can actually drift.
          // "new" always reads the working tree (a superset of HEAD when
          // clean) so a not-yet-committed edit to a commented line flags it
          // outdated immediately, rather than waiting for a commit.
          (file, side) => (side === "new"
            ? readWorkingTreeFile(repo.path, file)
            : readFileAtRef(repo.path, repo.baseRef, file)
          ).then(linesToContent),
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
    const since = Number(req.query.since ?? store.notificationCount);
    const already = store.notificationsSince(since);
    if (already.length > 0) {
      res.json({ notifications: already, cursor: since + already.length });
      return;
    }
    const onUpdate = () => {
      clearTimeout(timeout);
      const events = store.notificationsSince(since);
      res.json({ notifications: events, cursor: since + events.length });
    };
    const timeout = setTimeout(() => {
      store.emitter.off("notification", onUpdate);
      res.status(204).end();
    }, waitTimeoutMs);
    store.emitter.once("notification", onUpdate);
  });

  if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get("/session/:id", (_req, res) => res.sendFile("index.html", { root: webDistDir }));
  }

  return app;
}
