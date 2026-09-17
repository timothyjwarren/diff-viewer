#!/usr/bin/env node
import { startCommand } from "../cli/start.js";
import {
  waitCommand, watchCommand, reviewCommand, replyCommand, commentCommand, stopCommand, sessionsCommand,
} from "../cli/commands.js";

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "start": {
      console.log(JSON.stringify(await startCommand(rest)));
      break;
    }
    case "wait": {
      console.log(JSON.stringify(await waitCommand(rest[0])));
      break;
    }
    case "watch": {
      await watchCommand(rest[0]);
      break;
    }
    case "review": {
      console.log(JSON.stringify(await reviewCommand(rest[0])));
      break;
    }
    case "reply": {
      console.log(JSON.stringify(await replyCommand(rest[0], rest[1], rest[2])));
      break;
    }
    case "comment": {
      const [sessionId, repoPath, file, lineStart, lineEnd, side, text] = rest;
      console.log(JSON.stringify(await commentCommand(
        sessionId, repoPath, file, Number(lineStart), Number(lineEnd), side as "old" | "new", text,
      )));
      break;
    }
    case "stop": {
      await stopCommand(rest[0]);
      console.log(JSON.stringify({ stopped: rest[0] }));
      break;
    }
    case "sessions": {
      const repoIdx = rest.indexOf("--repo");
      const repoFilter = repoIdx >= 0 ? rest[repoIdx + 1] : undefined;
      console.log(JSON.stringify(await sessionsCommand(repoFilter)));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
