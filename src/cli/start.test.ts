import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startCommand, resumeCommand } from "./start.js";
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

describe("resumeCommand", () => {
  let home: string;
  const fake = path.join(__dirname, "testFixtures/fakeServer.mjs");

  async function writeData(extra: Record<string, unknown> = {}) {
    await fs.mkdir(path.join(home, "data"), { recursive: true });
    await fs.writeFile(path.join(home, "data", "s1.json"), JSON.stringify({
      id: "s1", title: "t", repos: [], scope: null, createdAt: "2026-01-01T00:00:00Z", status: "active",
      threads: [], verdicts: [], notifications: [], contentSnapshots: {}, ...extra,
    }));
  }
  async function writeRegistry(entry: Record<string, unknown>) {
    await fs.mkdir(path.join(home, "registry"), { recursive: true });
    await fs.writeFile(path.join(home, "registry", "s1.json"), JSON.stringify(entry));
  }
  async function spawnedArgs(): Promise<string[]> {
    return JSON.parse(await fs.readFile(path.join(home, "registry", "s1.json"), "utf-8")).args;
  }

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-resume-"));
    process.env.DIFFVIEWER_HOME = home;
  });

  afterEach(async () => {
    // Never signal the test worker itself (the "still running" case points the entry at it).
    const entry = await fs.readFile(path.join(home, "registry", "s1.json"), "utf-8").then(JSON.parse).catch(() => null);
    if (entry && entry.pid !== process.pid) await stopCommand("s1").catch(() => {});
    delete process.env.DIFFVIEWER_HOME;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("resumes on the saved port", async () => {
    await writeData({ port: 5555 });
    const result = await resumeCommand("s1", {}, fake);
    expect(result.sessionId).toBe("s1");
    expect(result.url).toBe("http://127.0.0.1:4321/session/s1");
    expect((await spawnedArgs()).join(" ")).toContain("--session-id s1 --resume --port 5555");
  });

  it("--port overrides the saved port", async () => {
    await writeData({ port: 5555 });
    await resumeCommand("s1", { port: 6000 }, fake);
    const args = await spawnedArgs();
    expect(args.join(" ")).toContain("--port 6000");
    expect(args).not.toContain("5555");
  });

  it("--any-port passes no port", async () => {
    await writeData({ port: 5555 });
    await resumeCommand("s1", { anyPort: true }, fake);
    const args = await spawnedArgs();
    expect(args).toContain("--resume");
    expect(args).not.toContain("--port");
  });

  it("needs a port for a session that never recorded one", async () => {
    await writeData();
    await expect(resumeCommand("s1", {}, fake)).rejects.toThrow(/--port <n>.*--any-port/s);
  });

  it("refuses a session that is still running", async () => {
    await writeData({ port: 5555 });
    await writeRegistry({ port: 4321, pid: process.pid });
    await expect(resumeCommand("s1", {}, fake)).rejects.toThrow(/already running.*http:\/\/127\.0\.0\.1:4321\/session\/s1/s);
  });

  it("clears a stale registry entry", async () => {
    await writeData({ port: 5555 });
    const child = spawn(process.execPath, ["-e", ""]);
    await new Promise(resolve => child.on("exit", resolve));
    await writeRegistry({ port: 4321, pid: child.pid });
    const result = await resumeCommand("s1", {}, fake);
    expect(result.sessionId).toBe("s1");
    expect(await spawnedArgs()).toContain("--resume");
  });

  it("fails when no saved session", async () => {
    await expect(resumeCommand("s1", {}, fake)).rejects.toThrow(/no saved session s1/);
  });

  it("suggests --any-port when the port is taken", async () => {
    await writeData({ port: 5555 });
    const busy = path.join(__dirname, "testFixtures/portInUseServer.mjs");
    await expect(resumeCommand("s1", {}, busy)).rejects.toThrow(/already in use.*--any-port/s);
  });

  it("reports a resume that won the race as already running, not as a busy port", async () => {
    await writeData({ port: 5555 });
    const raced = path.join(__dirname, "testFixtures/racedServer.mjs");
    const err = await resumeCommand("s1", {}, raced).catch(e => e as Error);
    expect(err.message).toMatch(/already running.*http:\/\/127\.0\.0\.1:5555\/session\/s1/s);
    expect(err.message).not.toMatch(/--any-port/);
  });

  it("rejects --port and --any-port together", async () => {
    await writeData({ port: 5555 });
    await expect(resumeCommand("s1", { port: 6000, anyPort: true }, fake)).rejects.toThrow(/either --port or --any-port/);
  });
});
