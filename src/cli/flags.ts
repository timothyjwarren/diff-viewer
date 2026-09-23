/** Pulls a `--flag value` pair out of argv, returning the value and the remaining args. */
export function extractFlag(argv: string[], flag: string): { value: string | undefined; rest: string[] } {
  const idx = argv.indexOf(flag);
  if (idx === -1) return { value: undefined, rest: argv };
  return { value: argv[idx + 1], rest: [...argv.slice(0, idx), ...argv.slice(idx + 2)] };
}

/** Pulls a boolean `--flag` (no value) out of argv, returning whether it was present and the remaining args. */
export function extractBooleanFlag(argv: string[], flag: string): { present: boolean; rest: string[] } {
  const idx = argv.indexOf(flag);
  if (idx === -1) return { present: false, rest: argv };
  return { present: true, rest: [...argv.slice(0, idx), ...argv.slice(idx + 1)] };
}

/**
 * Validates a `--port` value: an unset value maps to 0 (let the OS pick an
 * ephemeral port, the existing default), anything else must be an integer in
 * the valid TCP port range.
 */
export function validatePort(portArg: string | undefined): number {
  if (portArg === undefined) return 0;
  const port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value: ${portArg} (must be an integer between 1 and 65535)`);
  }
  return port;
}
