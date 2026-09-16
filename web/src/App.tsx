import { useEffect, useReducer, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DiffView, type CommentHandlers } from "./components/DiffView";
import { ReviewBar } from "./components/ReviewBar";
import {
  fetchDiffs, fetchThreads, createThread, addReply, editComment, deleteComment, submitVerdict,
} from "./api/client";
import { selectionReducer } from "./lib/selection";
import type { DiffFile, RepoDiff, CommentThread, VerdictType } from "./types";

function fileAnchorId(file: DiffFile): string {
  const name = file.newPath || file.oldPath;
  return `file-${(file.repoPath + "-" + name).replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function fileName(file: DiffFile): string {
  return file.newPath || file.oldPath;
}

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
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

  function scrollToFile(file: DiffFile) {
    document.getElementById(fileAnchorId(file))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function commentHandlersFor(file: DiffFile): CommentHandlers {
    const name = fileName(file);
    return {
      threads: threads.filter(t => t.repoPath === file.repoPath && t.file === name),
      selection: lineSelection && lineSelection.file === name ? lineSelection : null,
      onLineClick: (side, line) => dispatchLineSelection({ type: "click", file: name, side, line }),
      onLineShiftClick: (side, line) => dispatchLineSelection({ type: "shiftClick", file: name, side, line }),
      onCreateThread: async (side, lineStart, lineEnd, body, pending) => {
        if (!body.trim()) return;
        await createThread({ repoPath: file.repoPath, file: name, lineStart, lineEnd, side, body, pending });
        dispatchLineSelection({ type: "clear" });
        setThreads(await fetchThreads());
      },
      onReply: async (threadId, body, pending) => {
        if (!body.trim()) return;
        await addReply(threadId, body, pending);
        setThreads(await fetchThreads());
      },
      onEdit: async (threadId, commentId, body) => {
        const next = window.prompt("Edit comment", body);
        if (next == null) return;
        await editComment(threadId, commentId, next);
        setThreads(await fetchThreads());
      },
      onDelete: async (threadId, commentId) => {
        await deleteComment(threadId, commentId);
        setThreads(await fetchThreads());
      },
    };
  }

  async function handleSubmitVerdict(type: VerdictType, summary?: string) {
    await submitVerdict(type, summary);
    setThreads(await fetchThreads());
  }

  return (
    <div className="app">
      <Sidebar repos={repos} onSelectFile={scrollToFile} />
      <main>
        {repos.length === 0 && <p className="empty-state">No changes to review.</p>}
        {repos.map(repo => repo.files.map(file => (
          <div key={fileAnchorId(file)} id={fileAnchorId(file)} className="file-anchor">
            <DiffView
              file={file}
              repoPath={repo.repoPath}
              repoName={repo.repo}
              baseRef=""
              comments={commentHandlersFor(file)}
            />
          </div>
        )))}
      </main>
      <ReviewBar onSubmit={handleSubmitVerdict} />
    </div>
  );
}
