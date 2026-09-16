import type { DiffFile, RepoDiff } from "../types";

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
            {repo.files.map(file => (
              <li key={file.newPath || file.oldPath}>
                <button onClick={() => onSelectFile(file)}>
                  {file.newPath || file.oldPath}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
