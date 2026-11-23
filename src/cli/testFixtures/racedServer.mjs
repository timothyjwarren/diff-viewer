// Stands in for src/server.ts losing a race with another resume of the same
// session: this server finds the port taken and exits, and the winner (alive,
// here the test worker) registers a moment later.
import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const sessionId = args[args.indexOf("--session-id") + 1];
const entryPath = path.join(process.env.DIFFVIEWER_HOME, "registry", `${sessionId}.json`);
const entry = JSON.stringify({ port: 5555, pid: process.ppid });
spawn(process.execPath, ["-e", `setTimeout(() => require("fs").writeFileSync(${JSON.stringify(entryPath)}, ${JSON.stringify(entry)}), 300)`], {
  detached: true, stdio: "ignore",
}).unref();
console.error("diff-viewer: port 5555 is already in use");
process.exit(1);
