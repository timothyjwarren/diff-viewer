import fs from "node:fs/promises";
import path from "node:path";
import { getRegistryDir } from "./paths.js";

export interface RegistryEntry {
  port: number;
  pid: number;
}

export async function writeRegistryEntry(sessionId: string, entry: RegistryEntry): Promise<void> {
  await fs.mkdir(getRegistryDir(), { recursive: true });
  await fs.writeFile(path.join(getRegistryDir(), `${sessionId}.json`), JSON.stringify(entry));
}

export async function readRegistryEntry(sessionId: string): Promise<RegistryEntry> {
  const raw = await fs.readFile(path.join(getRegistryDir(), `${sessionId}.json`), "utf-8");
  return JSON.parse(raw) as RegistryEntry;
}

export async function removeRegistryEntry(sessionId: string): Promise<void> {
  await fs.rm(path.join(getRegistryDir(), `${sessionId}.json`), { force: true });
}
