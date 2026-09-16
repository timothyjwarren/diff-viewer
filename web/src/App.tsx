import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
import { fetchDiffs } from "./api/client";
import type { DiffFile, RepoDiff } from "./types";

interface Selection {
  file: DiffFile;
  repoPath: string;
  repoName: string;
}

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    fetchDiffs().then(setRepos);
  }, []);

  function selectFile(file: DiffFile) {
    const repo = repos.find(r => r.repoPath === file.repoPath);
    if (!repo) return;
    setSelection({ file, repoPath: repo.repoPath, repoName: repo.repo });
  }

  return (
    <div className="app">
      <Sidebar repos={repos} onSelectFile={selectFile} />
      <main>
        {selection ? (
          <DiffView
            file={selection.file}
            repoPath={selection.repoPath}
            repoName={selection.repoName}
            baseRef=""
          />
        ) : (
          "Select a file to review"
        )}
      </main>
    </div>
  );
}
