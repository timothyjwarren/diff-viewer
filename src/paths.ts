import os from "node:os";
import path from "node:path";

export function getHomeDir(): string {
  return process.env.DIFFVIEWER_HOME ?? path.join(os.homedir(), ".diff-viewer");
}

export function getRegistryDir(): string {
  return path.join(getHomeDir(), "registry");
}

export function getDataDir(): string {
  return path.join(getHomeDir(), "data");
}
