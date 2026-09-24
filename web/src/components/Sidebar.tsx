import { memo, useLayoutEffect, useRef, useState } from "react";
import type { CommentThread, CommitInfo, CommitRange, DiffFile, RepoDiff } from "../types";
import { CommitChooser } from "./CommitChooser";
import { fileAnchorId } from "../lib/fileAnchor";
import { elideDir } from "../lib/elidePath";
import type { ViewportSpan } from "../lib/viewportSpan";
import { STATUS_LETTER, totalDiffStat } from "../lib/fileSummary";
import { CommentIcon } from "./Icons";

let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string): number {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * A file path that elides middle directories to fit its row, keeping the
 * filename intact. Renders the full path until it has been measured.
 */
const FileName = memo(function FileName({ dir, base }: { dir: string; base: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ width: number; font: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, font: getComputedStyle(el).font });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shownDir = box
    ? elideDir(dir, base, text => textWidth(text, box.font) <= box.width)
    : dir ? `${dir}/` : "";
  return (
    <span ref={ref} className="sidebar-file-name">
      {shownDir && <span className="sidebar-file-dir">{shownDir}</span>}
      {base}
    </span>
  );
});

export function Sidebar({
  repos, onSelectFile, commitsByRepo = {}, rangeByRepo = {}, onRangeChange = () => {}, onOpenCommits = () => {},
  title = null, viewportSpan = null, threads = [],
}: {
  repos: RepoDiff[];
  onSelectFile: (file: DiffFile) => void;
  commitsByRepo?: Record<string, CommitInfo[]>;
  rangeByRepo?: Record<string, CommitRange | null>;
  onRangeChange?: (repoPath: string, range: CommitRange | null) => void;
  onOpenCommits?: (repoPath: string) => void;
  title?: string | null;
  viewportSpan?: ViewportSpan | null;
  threads?: CommentThread[];
}) {
  const allFiles = repos.flatMap(r => r.files);
  const stat = totalDiffStat(allFiles);
  const openThreadCount = (file: DiffFile, name: string) =>
    threads.filter(t => !t.resolved && t.repoPath === file.repoPath && t.file === name).length;

  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Position the viewport indicator over the rows of the files on screen,
  // from the top of the first one's row to the bottom of the last one's.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator || !viewportSpan) return;
    const startRow = nav.querySelector<HTMLElement>(`[data-file-id="${viewportSpan.startId}"]`);
    const endRow = nav.querySelector<HTMLElement>(`[data-file-id="${viewportSpan.endId}"]`);
    if (!startRow || !endRow) return;
    const origin = nav.getBoundingClientRect().top - nav.scrollTop;
    const start = startRow.getBoundingClientRect();
    const end = endRow.getBoundingClientRect();
    indicator.style.top = `${start.top - origin}px`;
    indicator.style.height = `${end.bottom - start.top}px`;
  }, [viewportSpan, repos]);

  return (
    <nav className="sidebar" ref={navRef}>
      {(title || allFiles.length > 0) && (
        <header className="sidebar-header">
          {title && <h1 className="sidebar-title">{title}</h1>}
          {allFiles.length > 0 && (
            <p className="sidebar-summary">
              {allFiles.length} file{allFiles.length === 1 ? "" : "s"}
              <span className="diffstat-added">+{stat.added}</span>
              <span className="diffstat-deleted">−{stat.deleted}</span>
            </p>
          )}
        </header>
      )}
      {viewportSpan && <div ref={indicatorRef} className="sidebar-viewport-indicator" data-testid="viewport-indicator" />}
      {repos.map(repo => (
        <div
          key={repo.repoPath}
          className={`sidebar-repo${rangeByRepo[repo.repoPath] ? " sidebar-repo-narrowed" : ""}`}
        >
          <div className="sidebar-repo-header">
            <span className="sidebar-repo-name" title={`${repo.repo}:${repo.branch}`}>
              {repo.repo}:{repo.branch}
            </span>
            <CommitChooser
              commits={commitsByRepo[repo.repoPath] ?? []}
              range={rangeByRepo[repo.repoPath] ?? null}
              onChange={range => onRangeChange(repo.repoPath, range)}
              onOpen={() => onOpenCommits(repo.repoPath)}
            />
          </div>
          <ul>
            {repo.files.map(file => {
              const name = file.newPath || file.oldPath;
              const slash = name.lastIndexOf("/");
              const base = slash >= 0 ? name.slice(slash + 1) : name;
              const dir = slash >= 0 ? name.slice(0, slash) : "";
              const openThreads = openThreadCount(file, name);
              return (
                <li key={name} title={name} data-file-id={fileAnchorId(file)}>
                  <button onClick={() => onSelectFile(file)}>
                    <span className={`file-status file-status-${file.status}`}>
                      {STATUS_LETTER[file.status]}
                    </span>
                    <FileName dir={dir} base={base} />
                    {openThreads > 0 && (
                      <span className="sidebar-file-threads" aria-label={`${openThreads} open thread${openThreads === 1 ? "" : "s"}`}>
                        <CommentIcon />{openThreads}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
