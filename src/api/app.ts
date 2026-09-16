import express from "express";
import path from "node:path";
import { SessionStore, type NewThreadInput } from "../session/sessionStore.js";
import { computeDiff } from "../git/diff.js";
import { readWorkingTreeFile, readFileAtRef } from "../git/fileContent.js";

export function createApp(store: SessionStore, webDistDir?: string, waitTimeoutMs = 55000): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/api/session", (_req, res) => res.json(store.snapshot));

  app.get("/api/diffs", async (_req, res) => {
    const session = store.snapshot;
    const results = await Promise.all(session.repos.map(async repo => ({
      repo: repo.name,
      repoPath: repo.path,
      files: await computeDiff(repo.path, repo.baseRef),
    })));
    res.json(results);
  });

  app.get("/api/file", async (req, res) => {
    const { repoPath, path: relPath, ref } = req.query as Record<string, string>;
    const lines = ref === "working"
      ? await readWorkingTreeFile(repoPath, relPath)
      : await readFileAtRef(repoPath, ref, relPath);
    res.json({ lines });
  });

  app.get("/api/threads", (_req, res) => res.json(store.snapshot.threads));

  app.post("/api/threads", async (req, res) => {
    const thread = store.addThread(req.body as NewThreadInput);
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
    app.get("/session/:id", (_req, res) => res.sendFile(path.join(webDistDir, "index.html")));
  }

  return app;
}
