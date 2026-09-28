import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { detectLanguage } from "../lib/language";
import { fetchFile } from "../api/client";
import { SHIKI_THEMES } from "../lib/highlight";

const LINE_SPAN_RE = /<code[^>]*>([\s\S]*)<\/code>/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function FileViewPage({ repoPath, filePath, gitRef, repoName }: {
  repoPath: string; filePath: string; gitRef: string; repoName: string;
}) {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rawLines = await fetchFile(repoPath, filePath, gitRef);
      const content = rawLines.join("\n");
      const html = await codeToHtml(content || " ", { lang: detectLanguage(filePath), ...SHIKI_THEMES });
      const match = LINE_SPAN_RE.exec(html);
      const inner = match ? match[1] : escapeHtml(content);
      if (!cancelled) setLines(inner.split("\n"));
    })();
    return () => { cancelled = true; };
  }, [repoPath, filePath, gitRef]);

  return (
    <div className="file-view-page">
      <div className="file-view-header">
        <span className="diff-view-repo">{repoName}</span>
        <span className="diff-view-base">{filePath}</span>
        <span className="file-view-ref">{gitRef}</span>
      </div>
      <div className="file-view-body">
        {lines?.map((html, i) => (
          <div className="file-view-line" key={i}>
            <span className="file-view-line-number">{i + 1}</span>
            <span className="file-view-line-code" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ))}
      </div>
    </div>
  );
}
