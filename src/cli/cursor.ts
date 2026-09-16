import fs from "node:fs/promises";
import path from "node:path";
import { getRegistryDir } from "../paths.js";

function cursorPath(sessionId: string): string {
  return path.join(getRegistryDir(), `${sessionId}.cursor`);
}

export async function readCursor(sessionId: string): Promise<number> {
  try {
    const raw = await fs.readFile(cursorPath(sessionId), "utf-8");
    return Number(raw) || 0;
  } catch {
    return 0;
  }
}

export async function writeCursor(sessionId: string, cursor: number): Promise<void> {
  await fs.mkdir(getRegistryDir(), { recursive: true });
  await fs.writeFile(cursorPath(sessionId), String(cursor));
}
