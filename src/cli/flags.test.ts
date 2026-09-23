import { describe, it, expect } from "vitest";
import { extractFlag, extractBooleanFlag, validatePort } from "./flags.js";

describe("extractFlag", () => {
  it("returns the value after the flag and removes both from rest", () => {
    expect(extractFlag(["a", "--port", "8080", "b"], "--port")).toEqual({
      value: "8080", rest: ["a", "b"],
    });
  });

  it("returns undefined value and the original argv when the flag is absent", () => {
    expect(extractFlag(["a", "b"], "--port")).toEqual({ value: undefined, rest: ["a", "b"] });
  });
});

describe("extractBooleanFlag", () => {
  it("reports present and removes the flag from rest", () => {
    expect(extractBooleanFlag(["a", "--pending", "b"], "--pending")).toEqual({
      present: true, rest: ["a", "b"],
    });
  });

  it("reports absent and returns the original argv when the flag is missing", () => {
    expect(extractBooleanFlag(["a", "b"], "--pending")).toEqual({ present: false, rest: ["a", "b"] });
  });
});

describe("validatePort", () => {
  it("defaults to 0 (OS-assigned) when unset", () => {
    expect(validatePort(undefined)).toBe(0);
  });

  it("accepts an in-range integer", () => {
    expect(validatePort("8080")).toBe(8080);
  });

  it.each(["0", "65536", "not-a-number", "8080.5"])("rejects an invalid value: %s", value => {
    expect(() => validatePort(value)).toThrow(/Invalid --port value/);
  });
});
