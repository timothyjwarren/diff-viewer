import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistryEntry } from "../registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER_PATH = path.join(__dirname, "../server.js");

export async function startCommand(
  repoArgs: string[],
  serverPath: string = DEFAULT_SERVER_PATH,
): Promise<{ sessionId: string; port: number; url: string }> {
  const sessionId = randomUUID();
  const child = spawn(process.execPath, [serverPath, "--session-id", sessionId, ...repoArgs], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const entry = await readRegistryEntry(sessionId);
      return { sessionId, port: entry.port, url: `http://127.0.0.1:${entry.port}/session/${sessionId}` };
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for diff-viewer server to start (session ${sessionId})`);
}
