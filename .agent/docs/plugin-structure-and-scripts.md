---
date: 2026-07-02
---

# Plugin Structure, Hooks, and Persistent Data

## Directory Structure

Every top-level directory/file a plugin can have, per the [standard plugin layout](https://code.claude.com/docs/en/plugins-reference). All of these sit at the plugin root, as siblings of `.claude-plugin/` — never inside it.

| Location | Auto-discovered? | Manifest field (default behavior) |
|---|---|---|
| `skills/<name>/SKILL.md` | Yes | `skills` — **adds to** the default scan |
| `commands/*.md` | Yes | `commands` — **replaces** the default scan |
| `agents/*.md` | Yes | `agents` — **replaces** the default scan |
| `output-styles/*.md` | Yes | `outputStyles` — **replaces** the default scan |
| `themes/*.json` | Yes | `experimental.themes` — **replaces** the default scan |
| `monitors/monitors.json` | Yes | `experimental.monitors` — **replaces** the default scan |
| `hooks/hooks.json` | Yes | `hooks` — **merges** with the default file |
| `.mcp.json` | Yes | `mcpServers` — **merges** with the default file |
| `.lsp.json` | Yes | `lspServers` — **merges** with the default file |
| `bin/*` | Yes (added to Bash `PATH`) | not configurable — always scanned |
| `scripts/*` | No — referenced explicitly | not configurable — pure convention |
| `settings.json` | Yes | not configurable — always scanned |
| `.claude-plugin/plugin.json` | n/a (the manifest itself) | — |

**Where to put an agent-facing script — the two real choices:**

- **`bin/`** — for anything the agent (or a human) is meant to run directly as a command, e.g. from a SKILL.md instruction. Files here are added to the Bash tool's `PATH` while the plugin is enabled, so they're invokable as bare commands (`my-tool args`, no path). This is what makes permission rules survive plugin updates — see the `bin/` section below.
- **`scripts/`** — for helper code that only other plugin components call (hooks, MCP/LSP servers, monitors), never the agent directly. No PATH injection; always referenced by explicit path, e.g. `${CLAUDE_PLUGIN_ROOT}/scripts/format-code.sh`. This is a naming convention only, not special harness behavior — but following it keeps a plugin's "public interface" (`bin/`) visually separate from its internals (`scripts/`).

**Skills vs. commands:** `skills/` is a directory per skill (`SKILL.md` plus optional reference docs, scripts, assets) and is the preferred structure for anything nontrivial. `commands/` is flat markdown files, one command per file, for lightweight cases with no supporting files. The docs say to prefer `skills/` for new plugins.

**Manifest override semantics matter:** most component fields (`commands`, `agents`, `outputStyles`, themes, monitors) *replace* the default directory scan if set at all — so declaring `"commands": ["./extra.md"]` in `plugin.json` means the default `commands/` directory is no longer scanned unless you list it too. `hooks`, `mcpServers`, and `lspServers` *merge* instead. `skills` *adds to* the default scan rather than replacing it. None of our plugins in this repo declare any of these fields — everything relies on pure directory-convention auto-discovery, which is the simplest approach and the right default until a plugin actually needs a non-standard layout.

## Configuration

Hooks belong in `hooks/hooks.json` at the plugin root (alongside `.claude-plugin/`). The harness manages registration and updates automatically.

Use `${CLAUDE_PLUGIN_ROOT}` to reference scripts — the harness substitutes it with the plugin's current install directory wherever it appears in hook commands, skill content, MCP/LSP config, etc. In SKILL.md bodies, write script paths as `${CLAUDE_PLUGIN_ROOT}/bin/<script>` (see the `bin/` section below) directly; the model executes this literally, so it always resolves through the stable path rather than the resolved absolute cache path shown when the skill loads.

Per the documented [standard plugin layout](https://code.claude.com/docs/en/plugins-reference), scripts referenced only from `hooks.json` (never invoked directly by the agent) belong in a top-level `scripts/` directory — not nested inside `skills/<name>/`. `scripts/` has no special harness behavior; it's just the conventional location, resolved the same way any other `${CLAUDE_PLUGIN_ROOT}` path is.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/jvm-build-guard.sh"
          }
        ]
      }
    ]
  }
}
```

## Variables

- `${CLAUDE_PLUGIN_ROOT}` — plugin's current install/cache directory. Treat as read-only; contents are wiped on update.
- `${CLAUDE_PLUGIN_DATA}` — persistent directory at `~/.claude/plugins/data/{plugin-id}/` that survives updates. Use for anything the plugin writes at runtime — build artifacts, user state, caches. Created automatically the first time the variable is referenced.

Both are text-substituted by the harness wherever they appear in hook commands, skill/agent content, and MCP/LSP config — **not** exported as real shell env vars to a general Bash tool subprocess. They're only exported as actual env vars to hook, MCP, and LSP subprocesses. This matters for `bin/` scripts (see below), which the agent invokes directly through the Bash tool: a script that does `${CLAUDE_PLUGIN_DATA:?not set}` internally will always fail, because nothing sets that var in its process environment. Also don't rely on `export`ing it in one Bash call and reading it in the next — Bash tool shell state (env vars, `cd`) does not persist between separate tool calls, only the working directory does.

The working pattern: keep the `${CLAUDE_PLUGIN_DATA}` reference in the *SKILL.md instruction text* (where it reliably substitutes to the real path before the model builds the command) and have the `bin/` script accept that path as an explicit CLI argument instead of reading an env var. Example: `android-installer`'s `bin/android-installer-build-adb-wireless.sh` compiles a native binary and needs a persistent place to put it (not `${CLAUDE_PLUGIN_ROOT}`, which is wiped on every plugin update). It takes `--data-dir <path>`, and SKILL.md calls it as `android-installer-build-adb-wireless.sh --data-dir "${CLAUDE_PLUGIN_DATA}"` — the substitution happens once, in the instruction text, and flows into the script as a normal argument.

## bin/ for agent-invoked scripts

Scripts the agent runs directly (per a SKILL.md instruction) should live in a `bin/` directory at the plugin root, not under `skills/`. The harness adds `bin/` to the Bash tool's `PATH` while the plugin is enabled, so scripts become invokable as bare commands (`my-script.sh args`) with no path at all.

This matters for permission rules: a `${CLAUDE_PLUGIN_ROOT}/...` reference still resolves to a literal version-hashed cache path when the Bash tool actually runs the command, and "don't ask again" bakes in that literal string — so the approval breaks on the next plugin update. A bare command name never encodes the hash, so `Bash(my-script.sh:*)` survives updates.

Since `bin/` is a single flat namespace shared by every enabled plugin, prefix script names with the plugin name (`npm-builder-run.sh`, not `run-for-agent.sh`) even when nothing collides today — a later plugin can easily pick the same generic name.

Hook scripts (referenced from `hooks/hooks.json`, never invoked directly by the agent) don't need this — they belong in `scripts/` instead, referenced via `${CLAUDE_PLUGIN_ROOT}/scripts/<script>`, since permission approval doesn't apply to hook execution the same way.

Don't have a skill capture the resolved path from the "Base directory for this skill: ..." line the harness prints when a skill loads (e.g. `SKILL_ROOT="$path"`). It's the same version-hashed cache path, just captured a different way, and it reintroduces the exact problem `${CLAUDE_PLUGIN_ROOT}`/`bin/` are meant to solve.

## Known Issues (as of June 2026)

`${CLAUDE_PLUGIN_ROOT}` is not injected for all hook types. `PreToolUse` and `PostToolUse` work reliably. `SessionStart` and stop hooks have reported injection failures (GitHub issues #27145, #36585, #66557). The superpowers plugin works around this in its session-start script by deriving `PLUGIN_ROOT` from `$(dirname "$0")` rather than relying on the env var.

## References

- [Plugins reference - Claude Code Docs](https://code.claude.com/docs/en/plugins-reference)
- [hook-development/SKILL.md · anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
- [Issue #18517: Plugin hooks in settings.json not updated when plugin version changes](https://github.com/anthropics/claude-code/issues/18517)
