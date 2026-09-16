#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./api/app.js";
import { SessionStore } from "./session/sessionStore.js";
import { resolveBaseRef } from "./git/gitRepo.js";
import { writeRegistryEntry } from "./registry.js";
import { parseRepoArgs } from "./parseRepoArgs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sessionIdIdx = argv.indexOf("--session-id");
  const sessionId = argv[sessionIdIdx + 1];
  const repoArgv = [...argv.slice(0, sessionIdIdx), ...argv.slice(sessionIdIdx + 2)];
  const repoArgs = parseRepoArgs(repoArgv);

  const repos = await Promise.all(repoArgs.map(async ({ path: repoPath, baseRef }) => ({
    path: path.resolve(repoPath),
    name: path.basename(repoPath),
    baseRef: await resolveBaseRef(repoPath, baseRef),
  })));

  const store = SessionStore.create(repos, sessionId);
  await store.persist();

  const webDistDir = path.join(__dirname, "../web/dist");
  const app = createApp(store, webDistDir);
  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    void writeRegistryEntry(sessionId, { port, pid: process.pid }).then(() => {
      console.log(JSON.stringify({ sessionId, port, url: `http://127.0.0.1:${port}/session/${sessionId}` }));
    });
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
}

void main();
