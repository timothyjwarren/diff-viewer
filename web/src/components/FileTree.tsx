import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTree } from "../api/client";
import type { TreeEntry } from "../types";

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function FileTree({ repoPath, gitRef, selectedPath, onSelectFile }: {
  repoPath: string;
  gitRef: string;
  selectedPath: string;
  onSelectFile: (path: string) => void;
}) {
  const [children, setChildren] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const requested = useRef(new Set<string>());
  const cache = useRef(new Map<string, TreeEntry[]>());

  useEffect(() => {
    requested.current = new Set();
    cache.current = new Map();
    setChildren({});
    setExpanded(new Set());
  }, [repoPath, gitRef]);

  const load = useCallback(async (dir: string): Promise<TreeEntry[] | null> => {
    const hit = cache.current.get(dir);
    if (hit) return hit;
    try {
      const { entries } = await fetchTree(repoPath, gitRef, dir);
      cache.current.set(dir, entries);
      setChildren(prev => ({ ...prev, [dir]: entries }));
      return entries;
    } catch {
      return null;
    }
  }, [repoPath, gitRef]);

  // Open every ancestor of the selected path (and the path itself when it is a directory).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const segs = selectedPath ? selectedPath.split("/") : [];
      const open: string[] = [];
      let dir = "";
      for (let i = 0; i <= segs.length; i++) {
        const listing = await load(dir);
        if (cancelled || !listing || i === segs.length) break;
        const entry = listing.find(e => e.name === segs[i]);
        if (!entry || entry.type !== "dir") break;
        dir = join(dir, segs[i]);
        open.push(dir);
      }
      if (!cancelled && open.length > 0) setExpanded(prev => new Set([...prev, ...open]));
    })();
    return () => { cancelled = true; };
  }, [selectedPath, load]);

  function toggle(dir: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
    if (!requested.current.has(dir)) {
      requested.current.add(dir);
      void load(dir);
    }
  }

  function renderDir(dir: string, depth: number) {
    const entries = children[dir];
    if (!entries) return depth === 0 ? <div className="file-tree-empty">Loading…</div> : null;
    return entries.map(entry => {
      const full = join(dir, entry.name);
      const badge = entry.changed ? <span className="file-tree-badge">diff</span> : null;
      if (entry.type === "dir") {
        const open = expanded.has(full);
        return (
          <div key={full}>
            <div
              role="treeitem" aria-expanded={open} className="file-tree-row file-tree-dir"
              style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(full)}
            >
              <span className="file-tree-caret">{open ? "▾" : "▸"}</span>
              <span className="file-tree-name">{entry.name}</span>{badge}
            </div>
            {open && renderDir(full, depth + 1)}
          </div>
        );
      }
      return (
        <div
          key={full} role="treeitem" aria-selected={full === selectedPath}
          className={`file-tree-row file-tree-file${full === selectedPath ? " file-tree-selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 + 14 }} onClick={() => onSelectFile(full)}
        >
          <span className="file-tree-name">{entry.name}</span>{badge}
        </div>
      );
    });
  }

  return <div className="file-tree" role="tree">{renderDir("", 0)}</div>;
}
