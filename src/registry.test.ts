import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeRegistryEntry, readRegistryEntry, removeRegistryEntry } from "./registry.js";

describe("registry", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-registry-"));
    process.env.DIFFVIEWER_HOME = home;
  });

  afterEach(async () => {
    delete process.env.DIFFVIEWER_HOME;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("writes, reads, and removes a registry entry", async () => {
    await writeRegistryEntry("s1", { port: 5000, pid: 1234 });
    expect(await readRegistryEntry("s1")).toEqual({ port: 5000, pid: 1234 });
    await removeRegistryEntry("s1");
    await expect(readRegistryEntry("s1")).rejects.toThrow();
  });
});
