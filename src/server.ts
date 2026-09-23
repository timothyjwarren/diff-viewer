#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./api/app.js";
import { SessionStore } from "./session/sessionStore.js";
import { resolveBaseRef, getCurrentBranch, assertValidRepoPath } from "./git/gitRepo.js";
import { writeRegistryEntry } from "./registry.js";
import { parseRepoArgs } from "./parseRepoArgs.js";
import { extractFlag, validatePort } from "./cli/flags.js";
import { getDataDir } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function defaultTitle(repos: Array<{ name: string; branch: string }>): string {
  if (repos.length === 1) return `${repos[0].name}:${repos[0].branch}`;
  const [first, ...rest] = repos;
  return rest.length === 0 ? first.name : `${first.name} (+${rest.length} more)`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { value: sessionId, rest: afterSessionId } = extractFlag(argv, "--session-id");
  const { value: titleArg, rest: afterTitle } = extractFlag(afterSessionId, "--title");
  const { value: portArg, rest: afterPort } = extractFlag(afterTitle, "--port");
  const { value: importSessionId, rest: repoArgv } = extractFlag(afterPort, "--import-session");
  const repoArgs = parseRepoArgs(repoArgv);

  let port: number;
  try {
    port = validatePort(portArg);
  } catch (err) {
    console.error(`diff-viewer: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (repoArgs.length === 0) {
    console.error("diff-viewer: no repo paths given (pass one or more <path[:baseRef]> arguments)");
    process.exit(1);
  }

  const validationErrors: string[] = [];
  for (const { path: repoPath } of repoArgs) {
    try {
      await assertValidRepoPath(path.resolve(repoPath));
    } catch (err) {
      validationErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (validationErrors.length > 0) {
    console.error(`diff-viewer: invalid repo path${validationErrors.length > 1 ? "s" : ""}:`);
    for (const msg of validationErrors) console.error(`  - ${msg}`);
    process.exit(1);
  }

  const repos = await Promise.all(repoArgs.map(async ({ path: repoPath, baseRef }) => {
    const resolvedPath = path.resolve(repoPath);
    return {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      branch: await getCurrentBranch(repoPath),
      baseRef: await resolveBaseRef(repoPath, baseRef),
    };
  }));

  if (!sessionId) throw new Error("Missing required --session-id argument");

  let store: SessionStore;
  if (importSessionId) {
    const sourcePath = path.join(getDataDir(), `${importSessionId}.json`);
    try {
      store = await SessionStore.importFrom(sourcePath, sessionId, repos, titleArg);
    } catch (err) {
      console.error(`diff-viewer: failed to import session ${importSessionId}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else {
    const title = titleArg ?? defaultTitle(repos);
    store = SessionStore.create(repos, sessionId, title);
  }
  await store.persist();

  const webDistDir = path.join(__dirname, "../web/dist");
  const app = createApp(store, webDistDir);
  const server = app.listen(port, "127.0.0.1");

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && portArg !== undefined) {
      console.error(`diff-viewer: port ${port} is already in use`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });

  server.once("listening", () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : 0;
    void writeRegistryEntry(sessionId, { port: boundPort, pid: process.pid }).then(() => {
      console.log(JSON.stringify({ sessionId, port: boundPort, url: `http://127.0.0.1:${boundPort}/session/${sessionId}` }));
    });
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
    // `server.close` alone waits for in-flight requests to finish naturally —
    // including the client's held-open /api/wait long-poll, which can hold a
    // connection for up to `waitTimeoutMs`. Force those closed so shutdown
    // (and the watching CLI's session-ended detection) is prompt.
    server.closeAllConnections();
  });
}

void main();
