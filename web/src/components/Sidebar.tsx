import type { CommitInfo, CommitRange, DiffFile, FileStatus, RepoDiff } from "../types";
import { CommitChooser } from "./CommitChooser";

const STATUS_LETTER: Record<FileStatus, string> = {
  added: "A", modified: "M", deleted: "D", renamed: "R",
};

export function Sidebar({
  repos, onSelectFile, commitsByRepo = {}, rangeByRepo = {}, onRangeChange = () => {}, onOpenCommits = () => {},
}: {
  repos: RepoDiff[];
  onSelectFile: (file: DiffFile) => void;
  commitsByRepo?: Record<string, CommitInfo[]>;
  rangeByRepo?: Record<string, CommitRange | null>;
  onRangeChange?: (repoPath: string, range: CommitRange | null) => void;
  onOpenCommits?: (repoPath: string) => void;
}) {
  return (
    <nav className="sidebar">
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
              return (
                <li key={name} title={name}>
                  <button onClick={() => onSelectFile(file)}>
                    <span className={`sidebar-file-status sidebar-file-status-${file.status}`}>
                      {STATUS_LETTER[file.status]}
                    </span>
                    <span className="sidebar-file-name">
                      {dir && <span className="sidebar-file-dir">{dir}/</span>}
                      {base}
                    </span>
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
