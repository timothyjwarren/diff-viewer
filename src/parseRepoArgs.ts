export interface RepoArg {
  path: string;
  baseRef?: string;
}

export function parseRepoArgs(args: string[]): RepoArg[] {
  return args.map(arg => {
    const idx = arg.lastIndexOf(":");
    if (idx <= 0) return { path: arg };
    return { path: arg.slice(0, idx), baseRef: arg.slice(idx + 1) };
  });
}
