// Stands in for src/server.ts in startCommand tests: writes a registry entry
// immediately instead of resolving real git refs or starting a real server.
// The entry also records the server's argv so tests can check what was passed.
import path from "node:path";
import fs from "node:fs/promises";

const args = process.argv.slice(2);
const sessionId = args[args.indexOf("--session-id") + 1];
const home = process.env.DIFFVIEWER_HOME;
const registryDir = path.join(home, "registry");
await fs.mkdir(registryDir, { recursive: true });
await fs.writeFile(path.join(registryDir, `${sessionId}.json`), JSON.stringify({ port: 4321, pid: process.pid, args }));
setInterval(() => {}, 1000);
