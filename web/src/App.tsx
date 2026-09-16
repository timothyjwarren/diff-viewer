import { useEffect, useReducer, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
import { ReviewBar } from "./components/ReviewBar";
import {
  fetchDiffs, fetchThreads, createThread, addReply, editComment, deleteComment, submitVerdict,
} from "./api/client";
import { selectionReducer } from "./lib/selection";
import type { DiffFile, RepoDiff, CommentThread, VerdictType } from "./types";

interface Selection {
  file: DiffFile;
  repoPath: string;
  repoName: string;
}

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [lineSelection, dispatchLineSelection] = useReducer(selectionReducer, null);

  useEffect(() => {
    fetchDiffs().then(setRepos);
  }, []);

  useEffect(() => {
    fetchThreads().then(setThreads);
    const interval = setInterval(() => {
      fetchThreads().then(setThreads);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  function selectFile(file: DiffFile) {
    const repo = repos.find(r => r.repoPath === file.repoPath);
    if (!repo) return;
    setSelection({ file, repoPath: repo.repoPath, repoName: repo.repo });
    dispatchLineSelection({ type: "clear" });
  }

  const currentFileName = selection ? (selection.file.newPath || selection.file.oldPath) : null;
  const currentThreads = currentFileName
    ? threads.filter(t => t.repoPath === selection!.repoPath && t.file === currentFileName)
    : [];
  const currentSelection = lineSelection && lineSelection.file === currentFileName ? lineSelection : null;

  async function handleCreateThread(side: "old" | "new", lineStart: number, lineEnd: number, body: string, pending: boolean) {
    if (!selection || !currentFileName || !body.trim()) return;
    await createThread({
      repoPath: selection.repoPath, file: currentFileName, lineStart, lineEnd, side, body, pending,
    });
    dispatchLineSelection({ type: "clear" });
    setThreads(await fetchThreads());
  }

  async function handleReply(threadId: string, body: string, pending: boolean) {
    if (!body.trim()) return;
    await addReply(threadId, body, pending);
    setThreads(await fetchThreads());
  }

  async function handleEdit(threadId: string, commentId: string, body: string) {
    const next = window.prompt("Edit comment", body);
    if (next == null) return;
    await editComment(threadId, commentId, next);
    setThreads(await fetchThreads());
  }

  async function handleDelete(threadId: string, commentId: string) {
    await deleteComment(threadId, commentId);
    setThreads(await fetchThreads());
  }

  async function handleSubmitVerdict(type: VerdictType, summary?: string) {
    await submitVerdict(type, summary);
    setThreads(await fetchThreads());
  }

  return (
    <div className="app">
      <Sidebar repos={repos} onSelectFile={selectFile} />
      <main>
        {selection && currentFileName ? (
          <DiffView
            file={selection.file}
            repoPath={selection.repoPath}
            repoName={selection.repoName}
            baseRef=""
            comments={{
              threads: currentThreads,
              selection: currentSelection,
              onLineClick: (side, line) => dispatchLineSelection({ type: "click", file: currentFileName, side, line }),
              onLineShiftClick: (side, line) => dispatchLineSelection({ type: "shiftClick", file: currentFileName, side, line }),
              onCreateThread: handleCreateThread,
              onReply: handleReply,
              onEdit: handleEdit,
              onDelete: handleDelete,
            }}
          />
        ) : (
          "Select a file to review"
        )}
      </main>
      <ReviewBar onSubmit={handleSubmitVerdict} />
    </div>
  );
}
