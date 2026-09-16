const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", go: "go", rb: "ruby", rs: "rust", java: "java",
  json: "json", md: "markdown", css: "css", html: "html",
  yml: "yaml", yaml: "yaml", sh: "bash",
};

export function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "text";
}
