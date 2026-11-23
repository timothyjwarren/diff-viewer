#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./api/app.js";
import { ViewerTracker, DEFAULT_VIEWER_TIMEOUTS } from "./api/viewerTracker.js";
import { writeRegistryEntry, removeRegistryEntry } from "./registry.js";
import { setupSession } from "./cli/setupSession.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  let setup;
  try {
    setup = await setupSession(process.argv.slice(2), process.cwd());
  } catch (err) {
    console.error(`diff-viewer: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const { store, sessionId, port, portArg, firstConnectArg, idleArg, warnings } = setup;
  for (const w of warnings) console.error(`diff-viewer: ${w}`);

  const webDistDir = path.join(__dirname, "../web/dist");
  const viewers = new ViewerTracker({
    ...DEFAULT_VIEWER_TIMEOUTS,
    ...(firstConnectArg !== undefined && { firstConnectMs: Number(firstConnectArg) * 1000 }),
    ...(idleArg !== undefined && { heartbeatMs: Number(idleArg) * 1000 }),
  });
  const app = createApp(store, webDistDir, undefined, undefined, viewers);
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
    store.setPort(boundPort);
    void store.persist()
      .then(() => writeRegistryEntry(sessionId, { port: boundPort, pid: process.pid }))
      .then(() => {
        console.log(JSON.stringify({ sessionId, port: boundPort, url: `http://127.0.0.1:${boundPort}/session/${sessionId}` }));
      });
  });

  // With no browser viewing the session, nobody can answer an agent: tell the
  // agent's waits why, then exit. Comments are already persisted on each change.
  const idleCheck = setInterval(() => {
    if (!viewers.shouldClose()) return;
    clearInterval(idleCheck);
    viewers.close();
    // Give the ended waits a moment to flush before the connections are cut.
    setTimeout(() => {
      void removeRegistryEntry(sessionId).then(() => {
        server.close(() => process.exit(0));
        server.closeAllConnections();
      });
    }, 200);
  }, 1000);
  idleCheck.unref();

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
