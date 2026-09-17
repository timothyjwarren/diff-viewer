import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "./app.js";
import { SessionStore } from "../session/sessionStore.js";
import { resolveBaseRef } from "../git/gitRepo.js";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("api app", () => {
  let repoPath: string;
  let dataDir: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-api-repo-"));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dv-api-data-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\n");
    await git(repoPath, ["add", "a.txt"]);
    await git(repoPath, ["commit", "-m", "base"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\n");
  });

  async function commitAll(message: string) {
    await git(repoPath, ["commit", "-am", message]);
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    return stdout.trim();
  }

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function buildStore() {
    const baseRef = await resolveBaseRef(repoPath);
    return SessionStore.create([{ path: repoPath, name: "repo", branch: "feature", baseRef }], "s1", "test session", dataDir);
  }

  it("GET /api/diffs returns parsed diffs for each repo", async () => {
    const app = createApp(await buildStore());
    const res = await request(app).get("/api/diffs");
    expect(res.status).toBe(200);
    expect(res.body[0].repo).toBe("repo");
    expect(res.body[0].files[0].newPath).toBe("a.txt");
  });

  it("GET /api/commits lists commits ahead of baseRef, oldest first", async () => {
    const app = createApp(await buildStore());
    const first = await commitAll("first");
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\n");
    const second = await commitAll("second");

    const res = await request(app).get("/api/commits").query({ repoPath });
    expect(res.status).toBe(200);
    expect(res.body.map((c: { sha: string }) => c.sha)).toEqual([first, second]);
    expect(res.body.map((c: { subject: string }) => c.subject)).toEqual(["first", "second"]);
  });

  it("GET /api/repo-diff with no range returns the same as the full baseRef diff", async () => {
    const app = createApp(await buildStore());
    await commitAll("first");
    const res = await request(app).get("/api/repo-diff").query({ repoPath });
    expect(res.status).toBe(200);
    expect(res.body[0].newPath).toBe("a.txt");
  });

  it("GET /api/repo-diff with a from/to range diffs only that commit range", async () => {
    const app = createApp(await buildStore());
    const first = await commitAll("first");
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\n");
    await commitAll("second");

    const res = await request(app).get("/api/repo-diff").query({ repoPath, from: first, to: first });
    expect(res.status).toBe(200);
    const addedLines = res.body[0].hunks.flatMap((h: { lines: { type: string; content: string }[] }) => h.lines)
      .filter((l: { type: string }) => l.type === "add").map((l: { content: string }) => l.content);
    expect(addedLines).toEqual(["two"]);
  });

  it("GET /api/file returns working-tree lines", async () => {
    const app = createApp(await buildStore());
    const res = await request(app).get("/api/file").query({ repoPath, path: "a.txt", ref: "working" });
    expect(res.body.lines).toEqual(["one", "two", ""]);
  });

  it("posting a non-pending user comment is immediately reflected in /api/wait", async () => {
    const app = createApp(await buildStore());
    await request(app).post("/api/threads").send({
      repoPath, file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false,
    });
    const res = await request(app).get("/api/wait").query({ since: 0 });
    expect(res.status).toBe(200);
    expect(res.body.notifications[0].type).toBe("comment");
  });

  it("a pending comment only shows up after a verdict is submitted, with correct intent", async () => {
    const app = createApp(await buildStore(), undefined, 100);
    await request(app).post("/api/threads").send({
      repoPath, file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "consider this", pending: true,
    });
    const waitBeforeSubmit = await request(app).get("/api/wait").query({ since: 0 });
    expect(waitBeforeSubmit.status).toBe(204);

    const verdictRes = await request(app).post("/api/verdicts").send({ type: "approve", summary: "lgtm" });
    const detailRes = await request(app).get(`/api/verdicts/${verdictRes.body.id}`);
    expect(detailRes.body.intent).toBe("discussion");
    expect(detailRes.body.threads).toHaveLength(1);
  });

  it("POST/DELETE .../ack moves a comment's agentStatus from acked to cleared", async () => {
    const app = createApp(await buildStore());
    const threadRes = await request(app).post("/api/threads").send({
      repoPath, file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "please rename this", pending: false,
    });
    const commentId = threadRes.body.comments[0].id;

    const ackRes = await request(app).post(`/api/threads/${threadRes.body.id}/comments/${commentId}/ack`);
    expect(ackRes.status).toBe(204);
    let threads = await request(app).get("/api/threads");
    expect(threads.body[0].comments[0].agentStatus).toBe("acked");

    const unackRes = await request(app).delete(`/api/threads/${threadRes.body.id}/comments/${commentId}/ack`);
    expect(unackRes.status).toBe(204);
    threads = await request(app).get("/api/threads");
    expect(threads.body[0].comments[0].agentStatus).toBe("cleared");
  });

  it("ack on an unknown thread/comment returns 404", async () => {
    const app = createApp(await buildStore());
    const res = await request(app).post("/api/threads/nope/comments/nope/ack");
    expect(res.status).toBe(404);
  });

  it("POST /api/mark-seen marks an untouched comment seen, without downgrading an acked one", async () => {
    const app = createApp(await buildStore());
    await request(app).post("/api/threads").send({
      repoPath, file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "one", pending: false,
    });
    let threads = await request(app).get("/api/threads");
    expect(threads.body[0].comments[0].agentStatus).toBeUndefined();

    const res = await request(app).post("/api/mark-seen");
    expect(res.status).toBe(204);
    threads = await request(app).get("/api/threads");
    expect(threads.body[0].comments[0].agentStatus).toBe("seen");

    const commentId = threads.body[0].comments[0].id;
    await request(app).post(`/api/threads/${threads.body[0].id}/comments/${commentId}/ack`);
    await request(app).post("/api/mark-seen");
    threads = await request(app).get("/api/threads");
    expect(threads.body[0].comments[0].agentStatus).toBe("acked");
  });
});
