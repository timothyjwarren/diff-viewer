import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistryEntry, removeRegistryEntry } from "../registry.js";
import { getDataDir, getRegistryDir } from "../paths.js";
import type { SessionData } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER_PATH = path.join(__dirname, "../server.js");

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface StartResult { sessionId: string; port: number; url: string }

export async function startCommand(
  repoArgs: string[],
  serverPath: string = DEFAULT_SERVER_PATH,
): Promise<StartResult> {
  return spawnServer(randomUUID(), repoArgs, serverPath);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Restarts a stopped session under its own id, loading its data file
 * unchanged. It binds the port the session last bound unless `port` names
 * another or `anyPort` lets the OS choose, so a viewer tab still open on the
 * old URL reconnects in place.
 */
export async function resumeCommand(
  sessionId: string,
  opts: { port?: number; anyPort?: boolean },
  serverPath: string = DEFAULT_SERVER_PATH,
): Promise<StartResult> {
  if (opts.port !== undefined && opts.anyPort) throw new Error("pass either --port or --any-port, not both");

  const entry = await readRegistryEntry(sessionId).catch(() => null);
  if (entry) {
    if (isAlive(entry.pid)) {
      throw new Error(`session ${sessionId} is already running at http://127.0.0.1:${entry.port}/session/${sessionId}`);
    }
    await removeRegistryEntry(sessionId);
  }

  let data: SessionData;
  try {
    data = JSON.parse(await fsPromises.readFile(path.join(getDataDir(), `${sessionId}.json`), "utf-8")) as SessionData;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`no saved session ${sessionId}`);
    throw new Error(`failed to read session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const port = opts.anyPort ? undefined : opts.port ?? data.port;
  if (!opts.anyPort && port === undefined) {
    throw new Error(
      `session ${sessionId} has no recorded port: pass --port <n> to resume on the port in the viewer tab's URL, ` +
      "or --any-port to resume on a new port (and a new URL)",
    );
  }

  const args = ["--resume", ...(port !== undefined ? ["--port", String(port)] : [])];
  try {
    return await spawnServer(sessionId, args, serverPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("already in use")) throw err;
    // Another resume of this session may have won the port: it registers
    // right after listening. Wait briefly for that, so the hint never leads to
    // a second server on the same session file.
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      const winner = await readRegistryEntry(sessionId).catch(() => null);
      if (winner && isAlive(winner.pid)) {
        throw new Error(`session ${sessionId} is already running at http://127.0.0.1:${winner.port}/session/${sessionId}`);
      }
      await sleep(100);
    }
    throw new Error(`${message} (pass --any-port to resume on a different port)`);
  }
}

async function spawnServer(sessionId: string, args: string[], serverPath: string): Promise<StartResult> {

  // The server runs detached so it outlives this CLI invocation, which means
  // its stdio can't be a pipe back to us (the pipe's write end closes with
  // our process, and a still-running server writing to it would crash on
  // EPIPE). Route stderr to a file instead, so that if the server dies
  // during startup (bad repo path, etc.) we can report why instead of just
  // "timed out" — and clean the file up once we know the outcome either way.
  await fsPromises.mkdir(getRegistryDir(), { recursive: true });
  const logPath = path.join(getRegistryDir(), `${sessionId}.startup.log`);
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [serverPath, "--session-id", sessionId, ...args], {
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
