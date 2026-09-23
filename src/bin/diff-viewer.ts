#!/usr/bin/env node
import { startCommand } from "../cli/start.js";
import {
  waitCommand, watchCommand, reviewCommand, replyCommand, commentCommand, ackCommand, unackCommand,
  stopCommand, sessionsCommand, type CommentOverrides,
} from "../cli/commands.js";
import { extractFlag, extractBooleanFlag } from "../cli/flags.js";

/**
 * Pulls the optional --author/--created-at/--pending overrides used to
 * manually reconstruct a session's comment history out of `argv`. Not
 * typical use — normal `comment`/`reply` calls never pass these.
 */
function parseCommentOverrides(argv: string[]): { overrides: CommentOverrides; rest: string[] } {
  const { value: authorArg, rest: afterAuthor } = extractFlag(argv, "--author");
  const { value: createdAt, rest: afterCreatedAt } = extractFlag(afterAuthor, "--created-at");
  const { present: pending, rest } = extractBooleanFlag(afterCreatedAt, "--pending");

  if (authorArg !== undefined && authorArg !== "user" && authorArg !== "agent") {
    throw new Error(`Invalid --author value: ${authorArg} (must be "user" or "agent")`);
  }
  if (createdAt !== undefined && Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`Invalid --created-at value: ${createdAt} (must be a valid date, e.g. ISO 8601)`);
  }

  return {
    overrides: {
      author: authorArg as CommentOverrides["author"],
      createdAt,
      pending: pending || undefined,
    },
    rest,
  };
}

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
      const { overrides, rest: replyRest } = parseCommentOverrides(rest);
      console.log(JSON.stringify(await replyCommand(replyRest[0], replyRest[1], replyRest[2], overrides)));
      break;
    }
    case "comment": {
      const { overrides, rest: commentRest } = parseCommentOverrides(rest);
      const [sessionId, repoPath, file, lineStart, lineEnd, side, text] = commentRest;
      console.log(JSON.stringify(await commentCommand(
        sessionId, repoPath, file, Number(lineStart), Number(lineEnd), side as "old" | "new", text, overrides,
      )));
      break;
    }
    case "ack": {
      await ackCommand(rest[0], rest[1], rest[2]);
      console.log(JSON.stringify({ acked: rest[2] }));
      break;
    }
    case "unack": {
      await unackCommand(rest[0], rest[1], rest[2]);
      console.log(JSON.stringify({ unacked: rest[2] }));
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
