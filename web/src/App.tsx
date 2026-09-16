import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { fetchDiffs } from "./api/client";
import type { DiffFile, RepoDiff } from "./types";

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<DiffFile | null>(null);

  useEffect(() => {
    fetchDiffs().then(setRepos);
  }, []);

  return (
    <div className="app">
      <Sidebar repos={repos} onSelectFile={setSelectedFile} />
      <main>{selectedFile ? selectedFile.newPath : "Select a file to review"}</main>
    </div>
  );
}
