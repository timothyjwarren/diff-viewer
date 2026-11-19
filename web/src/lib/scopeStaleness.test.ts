import { describe, it, expect } from "vitest";
import { compareScopeState } from "./scopeStaleness";
import type { ScopeState } from "../types";

const loaded: ScopeState = { files: { "a.sh": "h1", "b.sh": "h2" }, changed: ["a.sh"] };

describe("compareScopeState", () => {
  it("finds nothing stale when the state is identical", () => {
    expect(compareScopeState(loaded, structuredClone(loaded))).toEqual({ staleFiles: new Set(), repoStale: false });
  });

  it("marks only the file whose fingerprint differs", () => {
    const current = { ...loaded, files: { ...loaded.files, "b.sh": "h3" } };
    expect(compareScopeState(loaded, current)).toEqual({ staleFiles: new Set(["b.sh"]), repoStale: false });
  });

  it("marks the repo stale when a path enters the changed set", () => {
    const current = { files: { ...loaded.files, "dir/new.sh": "h9" }, changed: ["a.sh", "dir/new.sh"] };
    expect(compareScopeState(loaded, current).repoStale).toBe(true);
  });

  it("marks the repo stale when a path leaves the changed set", () => {
    expect(compareScopeState(loaded, { ...loaded, changed: [] }).repoStale).toBe(true);
  });

  it("marks the file and the repo stale when a file disappears", () => {
    const current = { ...loaded, files: { ...loaded.files, "a.sh": null } };
    expect(compareScopeState(loaded, current)).toEqual({ staleFiles: new Set(["a.sh"]), repoStale: true });
  });

  it("marks the file and the repo stale when a missing file appears", () => {
    const before = { ...loaded, files: { ...loaded.files, "c.sh": null } };
    const current = { ...loaded, files: { ...loaded.files, "c.sh": "h5" } };
    expect(compareScopeState(before, current)).toEqual({ staleFiles: new Set(["c.sh"]), repoStale: true });
  });

  it("marks the repo stale when a changed file isn't among the shown files, since it has no header for a notice", () => {
    const current = { ...loaded, files: { ...loaded.files, "b.sh": "h3" } };
    expect(compareScopeState(loaded, current, new Set(["a.sh"]))).toEqual({ staleFiles: new Set(["b.sh"]), repoStale: true });
    expect(compareScopeState(loaded, current, new Set(["a.sh", "b.sh"])).repoStale).toBe(false);
  });
});
