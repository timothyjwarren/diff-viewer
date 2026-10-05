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

  describe("files git reports without ---/+++ lines", () => {
    const EMPTY_ADDED = `diff --git a/empty.txt b/empty.txt
new file mode 100644
index 0000000..e69de29
`;
    const EMPTY_DELETED = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index e69de29..0000000
`;
    const MODE_ONLY = `diff --git a/run.sh b/run.sh
old mode 100644
new mode 100755
`;
    const BINARY = `diff --git a/img.png b/img.png
index bdc955b..8835708 100644
Binary files a/img.png and b/img.png differ
`;
    const SPACES = `diff --git a/my dir/my file.txt b/my dir/my file.txt
new file mode 100644
index 0000000..e69de29
`;

    it("takes the path of an empty added file from the diff --git line", () => {
      const [file] = parseUnifiedDiff(EMPTY_ADDED, "/repo");
      expect(file).toMatchObject({ oldPath: "empty.txt", newPath: "empty.txt", status: "added", hunks: [] });
    });

    it("takes the path of an empty deleted file from the diff --git line", () => {
      const [file] = parseUnifiedDiff(EMPTY_DELETED, "/repo");
      expect(file).toMatchObject({ oldPath: "gone.txt", newPath: "gone.txt", status: "deleted", hunks: [] });
    });

    it("reports a mode-only change as a modified file with its path", () => {
      const [file] = parseUnifiedDiff(MODE_ONLY, "/repo");
      expect(file).toMatchObject({ oldPath: "run.sh", newPath: "run.sh", status: "modified", hunks: [] });
    });

    it("reports a binary change as a modified file with its path", () => {
      const [file] = parseUnifiedDiff(BINARY, "/repo");
      expect(file).toMatchObject({ oldPath: "img.png", newPath: "img.png", status: "modified", hunks: [] });
    });

    it("handles paths containing spaces", () => {
      const [file] = parseUnifiedDiff(SPACES, "/repo");
      expect(file.newPath).toBe("my dir/my file.txt");
    });

    it("keeps each file's own path when several are mixed together", () => {
      const files = parseUnifiedDiff(EMPTY_ADDED + MODIFIED + MODE_ONLY, "/repo");
      expect(files.map((f) => f.newPath)).toEqual(["empty.txt", "a.txt", "run.sh"]);
    });
  });

  it("returns an empty array for empty diff text", () => {
    expect(parseUnifiedDiff("", "/repo")).toEqual([]);
  });
});
