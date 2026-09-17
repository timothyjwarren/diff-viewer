import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCommand } from "./start.js";
import { stopCommand } from "./commands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("startCommand", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-start-"));
    process.env.DIFFVIEWER_HOME = home;
  });

  afterEach(async () => {
    delete process.env.DIFFVIEWER_HOME;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("spawns the given server script and waits for its registry entry", async () => {
    const fixturePath = path.join(__dirname, "testFixtures/fakeServer.mjs");
    const result = await startCommand([], fixturePath);
    expect(result.port).toBe(4321);
    expect(result.url).toContain(result.sessionId);
    await stopCommand(result.sessionId);
  });

  it("surfaces the server's stderr instead of a generic timeout when it exits during startup", async () => {
    const fixturePath = path.join(__dirname, "testFixtures/failingServer.mjs");
    await expect(startCommand([], fixturePath)).rejects.toThrow(/Not a directory: \/nonexistent\/path/);
  });
});
