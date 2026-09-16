import { describe, it, expect } from "vitest";
import { verdictIntent } from "./types.js";

describe("verdictIntent", () => {
  it("maps request_changes to changes_requested", () => {
    expect(verdictIntent("request_changes")).toBe("changes_requested");
  });

  it("maps comment and approve to discussion", () => {
    expect(verdictIntent("comment")).toBe("discussion");
    expect(verdictIntent("approve")).toBe("discussion");
  });
});
