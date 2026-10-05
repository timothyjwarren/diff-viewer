import { useEffect, useState } from "react";
import type { DiffFile } from "../types";
import {
  diffFingerprint, fileKey, isCollapsed, readStoredReviews, writeStoredReviews,
  type ViewOverride,
} from "./reviewed";

/**
 * Which files the user has marked reviewed, and which are collapsed.
 * Reviewed marks persist per session in localStorage and apply only while
 * the file's diff is unchanged. They are dropped when the session's comments
 * are replaced (`replacedAt` changes). A reviewed file starts collapsed.
 *
 * `replacedAt` is undefined until the session has loaded.
 */
export function useReviewedFiles(
  sessionId: string | null, replacedAt: string | null | undefined, files: DiffFile[],
) {
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, ViewOverride>>({});
  const stamp = replacedAt ?? null;

  useEffect(() => {
    if (!sessionId || replacedAt === undefined) return;
    const stored = readStoredReviews(sessionId);
    setMarks(stored && stored.stamp === (replacedAt ?? null) ? stored.files : {});
    setOverrides({});
  }, [sessionId, replacedAt]);

  const isReviewed = (file: DiffFile) => marks[fileKey(file)] === diffFingerprint(file);
  const collapsedFiles = (file: DiffFile) => isCollapsed(overrides[fileKey(file)], isReviewed(file));

  function saveMarks(next: Record<string, string>) {
    setMarks(next);
    if (sessionId) writeStoredReviews(sessionId, { stamp, files: next });
  }

  function setOverride(keys: string[], value: ViewOverride | null) {
    setOverrides(prev => {
      const next = { ...prev };
      for (const key of keys) {
        if (value) next[key] = value;
        else delete next[key];
      }
      return next;
    });
  }

  function toggleReviewed(file: DiffFile) {
    const key = fileKey(file);
    const next = { ...marks };
    if (isReviewed(file)) delete next[key];
    else next[key] = diffFingerprint(file);
    saveMarks(next);
    setOverride([key], null);
  }

  function toggleCollapsed(file: DiffFile) {
    setOverride([fileKey(file)], collapsedFiles(file) ? "expanded" : "collapsed");
  }

  const reviewedFiles = files.filter(isReviewed);
  const anyReviewedCollapsed = reviewedFiles.some(collapsedFiles);

  /** Expands every reviewed file if any is collapsed, otherwise collapses them all. */
  function toggleAllReviewed() {
    setOverride(reviewedFiles.map(fileKey), anyReviewedCollapsed ? "expanded" : "collapsed");
  }

  return {
    isReviewed,
    isCollapsed: collapsedFiles,
    toggleReviewed,
    toggleCollapsed,
    toggleAllReviewed,
    reviewedCount: reviewedFiles.length,
    anyReviewedCollapsed,
  };
}
