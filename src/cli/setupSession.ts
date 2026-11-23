import path from "node:path";
import { SessionStore } from "../session/sessionStore.js";
import { resolveBaseRef, getCurrentBranch, assertValidRepoPath } from "../git/gitRepo.js";
import { parseRepoArgs } from "../parseRepoArgs.js";
import { extractFlag, extractBooleanFlag, extractListFlag, validatePort } from "./flags.js";
import { getDataDir } from "../paths.js";
import { resolveScopePaths, inferRepoRoots } from "../scope/scope.js";
import type { ScopeEntry } from "../types.js";

function defaultTitle(repos: Array<{ name: string; branch: string }>): string {
  if (repos.length === 1) return `${repos[0].name}:${repos[0].branch}`;
  const [first, ...rest] = repos;
  return rest.length === 0 ? first.name : `${first.name} (+${rest.length} more)`;
}

export interface SessionSetup {
  store: SessionStore;
  sessionId: string;
  port: number;
  portArg: string | undefined;
  firstConnectArg: string | undefined;
  idleArg: string | undefined;
  /** Non-fatal problems to print to stderr. */
  warnings: string[];
}

/**
 * Parses the server's argv and builds its persisted session. Relative repo
 * and `--files` paths resolve against `cwd`. With `--files` and no repo
 * arguments, the repos are the git repos containing those files. Throws with
 * a user-facing message on any invalid argument.
 *
 * With `--resume`, loads the session's existing data file unchanged (same id,
 * repos, scope and comments) instead of building one.
 */
export async function setupSession(argv: string[], cwd: string): Promise<SessionSetup> {
  // --files first: its list ends at the next flag, so the other flags must still be in place.
  const { values: files, rest: withoutFiles } = extractListFlag(argv, "--files");
  const { value: sessionId, rest: afterSessionId } = extractFlag(withoutFiles, "--session-id");
  const { value: titleArg, rest: afterTitle } = extractFlag(afterSessionId, "--title");
  const { value: descriptionArg, rest: afterDescription } = extractFlag(afterTitle, "--description");
  const { value: portArg, rest: afterPort } = extractFlag(afterDescription, "--port");
  const { value: firstConnectArg, rest: afterFirstConnect } = extractFlag(afterPort, "--first-connect-timeout");
  const { value: idleArg, rest: afterIdle } = extractFlag(afterFirstConnect, "--idle-timeout");
  const { value: importSessionId, rest: afterImport } = extractFlag(afterIdle, "--import-session");
  const { present: resume, rest: repoArgv } = extractBooleanFlag(afterImport, "--resume");

  const port = validatePort(portArg);
  if (resume) {
    if (repoArgv.length > 0 || files !== undefined || importSessionId !== undefined) {
      throw new Error("--resume takes no repo paths, --files or --import-session");
    }
    if (!sessionId) throw new Error("Missing required --session-id argument");
    let store: SessionStore;
    try {
      store = await SessionStore.load(path.join(getDataDir(), `${sessionId}.json`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`no saved session ${sessionId}`);
      throw new Error(`failed to load session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (titleArg !== undefined) store.setTitle(titleArg);
    if (descriptionArg !== undefined) store.setDescription(descriptionArg);
    await store.persist();
    return { store, sessionId, port, portArg, firstConnectArg, idleArg, warnings: [] };
  }
  if (files !== undefined && files.length === 0) throw new Error("--files needs at least one path");

  const repoArgs = repoArgv.length === 0 && files
    ? (await inferRepoRoots(files, cwd)).map(p => ({ path: p, baseRef: undefined }))
    : parseRepoArgs(repoArgv);
  if (repoArgs.length === 0) throw new Error("no repo paths given (pass one or more <path[:baseRef]> arguments)");

  const validationErrors: string[] = [];
  for (const { path: repoPath } of repoArgs) {
    try {
      await assertValidRepoPath(path.resolve(cwd, repoPath));
    } catch (err) {
      validationErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (validationErrors.length > 0) {
    throw new Error(`invalid repo path${validationErrors.length > 1 ? "s" : ""}:\n${validationErrors.map(m => `  - ${m}`).join("\n")}`);
  }

  const repos = await Promise.all(repoArgs.map(async ({ path: repoPath, baseRef }) => {
    const resolvedPath = path.resolve(cwd, repoPath);
    return {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      branch: await getCurrentBranch(resolvedPath),
      baseRef: await resolveBaseRef(resolvedPath, baseRef),
    };
  }));

  if (!sessionId) throw new Error("Missing required --session-id argument");

  const scope: ScopeEntry[] | undefined = files ? await resolveScopePaths(files, repos, cwd) : undefined;
  const warnings: string[] = [];
  let store: SessionStore;
  if (importSessionId) {
    const sourcePath = path.join(getDataDir(), `${importSessionId}.json`);
    try {
      store = await SessionStore.importFrom(sourcePath, sessionId, repos, titleArg, getDataDir(), scope);
    } catch (err) {
      throw new Error(`failed to import session ${importSessionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const e of store.lastImportDropped) warnings.push(`dropped scope entry ${e.repoPath}:${e.path} (no matching repo)`);
  } else {
    store = SessionStore.create(repos, sessionId, titleArg ?? defaultTitle(repos), getDataDir());
    if (scope) store.setScope(scope);
  }
  if (descriptionArg !== undefined) store.setDescription(descriptionArg);
  await store.persist();
  return { store, sessionId, port, portArg, firstConnectArg, idleArg, warnings };
}
