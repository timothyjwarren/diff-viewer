import { describe, it, expect } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("maps common extensions to shiki language ids", () => {
    expect(detectLanguage("a.ts")).toBe("typescript");
    expect(detectLanguage("a.tsx")).toBe("tsx");
    expect(detectLanguage("a.py")).toBe("python");
    expect(detectLanguage("a.go")).toBe("go");
  });

  it("falls back to plain text for unknown extensions", () => {
    expect(detectLanguage("a.weird")).toBe("text");
  });
});
