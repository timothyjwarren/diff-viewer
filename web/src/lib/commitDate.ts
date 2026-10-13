import { timeAgo } from "./timeAgo";

const RELATIVE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

function monthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A commit's age at a glance: relative while recent, a short absolute date after that. "" when undated. */
export function commitDateLabel(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (now.getTime() - date.getTime() < RELATIVE_LIMIT_MS) return timeAgo(iso, now);
  return date.getFullYear() === now.getFullYear()
    ? monthDay(date)
    : `${monthDay(date)}, ${date.getFullYear()}`;
}

/** The full local date and time, for a tooltip. "" when undated. */
export function commitDateTitle(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
}

/** Identifies the local calendar day an instant falls on. "" when undated. */
export function dayKey(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** The heading for a run of commits made on the same day. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return "Yesterday";
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  return date.getFullYear() === now.getFullYear()
    ? `${weekday}, ${monthDay(date)}`
    : `${weekday}, ${monthDay(date)}, ${date.getFullYear()}`;
}
