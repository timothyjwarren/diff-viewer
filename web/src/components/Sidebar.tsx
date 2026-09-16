import type { DiffFile, FileStatus, RepoDiff } from "../types";

const STATUS_LETTER: Record<FileStatus, string> = {
  added: "A", modified: "M", deleted: "D", renamed: "R",
};

export function Sidebar({ repos, onSelectFile }: {
  repos: RepoDiff[];
  onSelectFile: (file: DiffFile) => void;
}) {
  return (
    <nav className="sidebar">
      {repos.map(repo => (
        <div key={repo.repoPath} className="sidebar-repo">
          <div className="sidebar-repo-name">{repo.repo}</div>
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
