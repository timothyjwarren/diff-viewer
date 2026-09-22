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

  it("maps kotlin, swift, terraform, xml, sql, avro, scala, obj-c, and scss extensions", () => {
    expect(detectLanguage("a.kt")).toBe("kotlin");
    expect(detectLanguage("a.kts")).toBe("kotlin");
    expect(detectLanguage("a.swift")).toBe("swift");
    expect(detectLanguage("a.tf")).toBe("terraform");
    expect(detectLanguage("a.tfvars")).toBe("terraform");
    expect(detectLanguage("a.xml")).toBe("xml");
    expect(detectLanguage("a.sql")).toBe("sql");
    expect(detectLanguage("a.avsc")).toBe("json");
    expect(detectLanguage("a.scala")).toBe("scala");
    expect(detectLanguage("a.sc")).toBe("scala");
    expect(detectLanguage("a.m")).toBe("objective-c");
    expect(detectLanguage("a.mm")).toBe("objective-c");
    expect(detectLanguage("a.scss")).toBe("scss");
  });
});
