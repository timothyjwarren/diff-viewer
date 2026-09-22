const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", go: "go", rb: "ruby", rs: "rust", java: "java",
  json: "json", md: "markdown", css: "css", html: "html",
  yml: "yaml", yaml: "yaml", sh: "bash",
  kt: "kotlin", kts: "kotlin",
  swift: "swift",
  tf: "terraform", tfvars: "terraform",
  xml: "xml",
  sql: "sql",
  avsc: "json",
  scala: "scala", sc: "scala",
  m: "objective-c", mm: "objective-c",
  scss: "scss",
};

export function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "text";
}
