import { useEffect, useState } from "react";
import { fetchTree } from "../api/client";
import { buildBrowseUrl, parseBrowseParams, type BrowseParams } from "../lib/route";
import { useBrowserSession } from "../lib/useBrowserSession";
import { FileTree } from "./FileTree";
import { FilePane } from "./FilePane";

type Kind = "loading" | "file" | "dir" | "missing" | "error";

export function BrowserPage({ repoPath, ref, path: initialPath, line: initialLine }: BrowseParams) {
  const [path, setPath] = useState(initialPath);
  const [line, setLine] = useState(initialLine);
  const [kind, setKind] = useState<Kind>("loading");
  const [repoName, setRepoName] = useState("");
  const session = useBrowserSession(repoPath);

  useEffect(() => {
    const onPop = () => {
      const p = parseBrowseParams(window.location.search);
      setPath(p.path);
      setLine(p.line);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Whether `path` is a file or a directory is read from the listing of its parent.
  useEffect(() => {
    let cancelled = false;
    setKind("loading");
    const slash = path.lastIndexOf("/");
    const parent = path === "" ? "" : slash === -1 ? "" : path.slice(0, slash);
    fetchTree(repoPath, ref, parent).then(
      ({ repoName: name, entries }) => {
        if (cancelled) return;
        setRepoName(name);
        if (path === "") return setKind("dir");
        const entry = entries.find(e => e.name === path.slice(slash + 1));
        setKind(entry ? (entry.type === "dir" ? "dir" : "file") : "missing");
      },
      (err: Error) => {
        if (!cancelled) setKind(/^40[04]\b/.test(err.message) ? "missing" : "error");
      },
    );
    return () => { cancelled = true; };
  }, [repoPath, ref, path]);

  function selectFile(p: string) {
    window.history.pushState(null, "", buildBrowseUrl({ repoPath, ref, path: p }));
    setPath(p);
    setLine(undefined);
  }

  const shownRef = ref === "uncommitted" ? ref : ref.slice(0, 7);

  let pane;
  if (kind === "file") pane = <FilePane repoPath={repoPath} gitRef={ref} filePath={path} line={line} session={session} />;
  else if (kind === "dir") pane = <div className="file-pane-state">Select a file</div>;
  else if (kind === "missing") pane = <div className="file-pane-state">Path not found at this ref</div>;
  else if (kind === "error") pane = <div className="file-pane-state">Could not load this path</div>;
  else pane = <div className="file-pane-state">Loading…</div>;

  return (
    <div className="browser-page">
      <div className="file-view-header">
        <span className="diff-view-repo">{repoName}</span>
        <span className="diff-view-base">{path || "/"}</span>
        <span className="file-view-ref" title={ref}>{shownRef}</span>
      </div>
      <div className="browser-body">
        <aside className="browser-sidebar">
          <FileTree repoPath={repoPath} gitRef={ref} selectedPath={path} onSelectFile={selectFile} />
        </aside>
        <main className="browser-main">{pane}</main>
      </div>
    </div>
  );
}
