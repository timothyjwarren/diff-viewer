import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./diffParser.js";

const MODIFIED = `diff --git a/a.txt b/a.txt
index abc123..def456 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@
 one
-two
+two changed
+three
 four
`;

const ADDED = `diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
`;

describe("parseUnifiedDiff", () => {
  it("parses a modified file with correct line numbers", () => {
    const files = parseUnifiedDiff(MODIFIED, "/repo");
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file.status).toBe("modified");
    expect(file.oldPath).toBe("a.txt");
    expect(file.newPath).toBe("a.txt");
    expect(file.hunks).toHaveLength(1);
    const [hunk] = file.hunks;
    expect(hunk.lines).toEqual([
      { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "one" },
      { type: "del", oldLineNumber: 2, newLineNumber: null, content: "two" },
      { type: "add", oldLineNumber: null, newLineNumber: 2, content: "two changed" },
      { type: "add", oldLineNumber: null, newLineNumber: 3, content: "three" },
      { type: "context", oldLineNumber: 3, newLineNumber: 4, content: "four" },
    ]);
  });

  it("parses an added file", () => {
    const files = parseUnifiedDiff(ADDED, "/repo");
    expect(files[0].status).toBe("added");
    expect(files[0].newPath).toBe("new.txt");
  });

  it("returns an empty array for empty diff text", () => {
    expect(parseUnifiedDiff("", "/repo")).toEqual([]);
  });
});
