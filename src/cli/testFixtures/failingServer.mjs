// Stands in for a server.ts that fails startup validation: writes to stderr
// and exits nonzero without ever writing a registry entry, so startCommand
// tests can verify that failure is surfaced instead of a generic timeout.
console.error("diff-viewer: invalid repo path:");
console.error("  - Not a directory: /nonexistent/path");
process.exit(1);
