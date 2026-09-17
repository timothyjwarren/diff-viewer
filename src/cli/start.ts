import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistryEntry } from "../registry.js";
import { getRegistryDir } from "../paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER_PATH = path.join(__dirname, "../server.js");

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startCommand(
  repoArgs: string[],
  serverPath: string = DEFAULT_SERVER_PATH,
): Promise<{ sessionId: string; port: number; url: string }> {
  const sessionId = randomUUID();

  // The server runs detached so it outlives this CLI invocation, which means
  // its stdio can't be a pipe back to us (the pipe's write end closes with
  // our process, and a still-running server writing to it would crash on
  // EPIPE). Route stderr to a file instead, so that if the server dies
  // during startup (bad repo path, etc.) we can report why instead of just
  // "timed out" — and clean the file up once we know the outcome either way.
  await fsPromises.mkdir(getRegistryDir(), { recursive: true });
  const logPath = path.join(getRegistryDir(), `${sessionId}.startup.log`);
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [serverPath, "--session-id", sessionId, ...repoArgs], {
    detached: true,
    stdio: ["ignore", "ignore", logFd],
    env: process.env,
  });
  fs.closeSync(logFd);
  child.unref();

  let childExited = false;
  let childExitCode: number | null = null;
  child.on("exit", code => { childExited = true; childExitCode = code; });
  child.on("error", () => { childExited = true; });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const entry = await readRegistryEntry(sessionId);
      await fsPromises.rm(logPath, { force: true });
      return { sessionId, port: entry.port, url: `http://127.0.0.1:${entry.port}/session/${sessionId}` };
    } catch {
      if (childExited) break;
      await sleep(100);
    }
  }

  let details = "";
  try {
    details = (await fsPromises.readFile(logPath, "utf-8")).trim();
  } catch {
    // no log file to read; fall through to the generic message below
  }
  await fsPromises.rm(logPath, { force: true }).catch(() => {});

  const reason = details || (childExited
    ? `server process exited with code ${childExitCode}`
    : "timed out waiting for it to report ready");
  throw new Error(`diff-viewer server failed to start (session ${sessionId}): ${reason}`);
}
