import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import type { DiffFile, DiffHunk, DiffLine } from "../types";
import { detectLanguage } from "../lib/language";
import { expandHunkContext } from "../lib/expandContext";
import { fetchFile } from "../api/client";

function Line({ line, lang, repoName }: { line: DiffLine; lang: string; repoName: string }) {
  const [html, setHtml] = useState<string>(line.content);
  useEffect(() => {
    let cancelled = false;
    codeToHtml(line.content || " ", { lang, theme: "github-dark" }).then(result => {
      if (!cancelled) setHtml(result);
    }).catch(() => setHtml(line.content));
    return () => { cancelled = true; };
  }, [line.content, lang]);

  return (
    <div className={`diff-line diff-line-${line.type}`} data-line-number={line.newLineNumber ?? line.oldLineNumber}>
      <span dangerouslySetInnerHTML={{ __html: html }} data-repo={repoName} />
    </div>
  );
}

function Pane({ hunks, side, lang, repoName }: { hunks: DiffHunk[]; side: "old" | "new"; lang: string; repoName: string }) {
  return (
    <div className="diff-pane" data-side={side}>
      {hunks.map((hunk, hi) => (
        <div key={hi} className="diff-hunk">
          {hunk.lines
            .filter(l => side === "old" ? l.type !== "add" : l.type !== "del")
            .map((l, li) => <Line key={li} line={l} lang={lang} repoName={repoName} />)}
        </div>
      ))}
    </div>
  );
}

export function DiffView({ file, repoPath, repoName, baseRef }: {
  file: DiffFile; repoPath: string; repoName: string; baseRef: string;
}) {
  const [hunks, setHunks] = useState<DiffHunk[]>(file.hunks);
  const [viewingFullFile, setViewingFullFile] = useState(false);
  const [fullFileLines, setFullFileLines] = useState<string[] | null>(null);
  const lang = detectLanguage(file.newPath || file.oldPath);

  useEffect(() => setHunks(file.hunks), [file]);
  void baseRef;

  async function loadFullFile() {
    const lines = await fetchFile(repoPath, file.newPath, "working");
    setFullFileLines(lines);
    return lines;
  }

  async function expand(hunkIndex: number, direction: "up" | "down") {
    const lines = fullFileLines ?? await loadFullFile();
    setHunks(prev => expandHunkContext(prev, lines, hunkIndex, direction));
  }

  async function toggleViewFile() {
    if (!viewingFullFile) await loadFullFile();
    setViewingFullFile(v => !v);
  }

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <span>{repoName} &rsaquo; {file.newPath || file.oldPath}</span>
        <button onClick={toggleViewFile}>{viewingFullFile ? "View Diff" : "View File"}</button>
      </div>
      <div className="diff-view-body">
        {viewingFullFile && fullFileLines ? (
          <Pane
            hunks={[{ oldStart: 1, oldLines: fullFileLines.length, newStart: 1, newLines: fullFileLines.length,
              lines: fullFileLines.map((content, idx) => ({ type: "context", oldLineNumber: idx + 1, newLineNumber: idx + 1, content })) }]}
            side="new" lang={lang} repoName={repoName}
          />
        ) : (
          <>
            <Pane hunks={hunks} side="old" lang={lang} repoName={repoName} />
            <Pane hunks={hunks} side="new" lang={lang} repoName={repoName} />
          </>
        )}
      </div>
      {!viewingFullFile && hunks.map((_, hi) => (
        <div key={hi} className="diff-expand-controls">
          <button onClick={() => expand(hi, "up")}>Expand above</button>
          <button onClick={() => expand(hi, "down")}>Expand below</button>
        </div>
      ))}
    </div>
  );
}
