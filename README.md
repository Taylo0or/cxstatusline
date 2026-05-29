# cxstatusline

A Codex-aware statusline toolkit inspired by `ccstatusline`.

Codex does not currently expose Claude Code's `statusLine.command` protocol, so
`cxstatusline` supports two integration modes:

1. Configure Codex's native `[tui].status_line` footer items.
2. Collect Codex lifecycle events with hooks and render a richer external
   statusline for tmux, zsh/starship, SketchyBar, or any command runner.

## Features

- Powerline-style renderer with ANSI truecolor themes.
- Built-in themes: `powerline`, `classic`, `mono`, `solarized`, and `dracula`.
- Codex hook collector for session, prompt, tool, compaction, subagent, and stop
  events.
- Codex native footer installer for all currently known built-in status items.
- Git widgets: branch, SHA, staged/unstaged/untracked/conflict counts,
  ahead/behind, insertions, deletions, origin owner/repo, upstream, worktree
  mode/branch, fork status, clickable GitHub/GitLab branch links, and PR/MR
  metadata through `gh`/`glab` when available.
- Codex/session widgets: model, reasoning effort, service tier, permission mode,
  sandbox mode, session id/name, output style, vim/voice/remote-control status
  when present, skills, run state, last event, last tool, compaction count,
  duration, and best-effort token/context/cost metrics when Codex exposes them
  through hook payloads or transcript entries.
- Usage widgets: token/input/output/total speed, session and weekly usage,
  Sonnet/Opus weekly usage when available, context used/remaining/window,
  context bars, cached/cache-read/cache-write tokens, five-hour block timer,
  reset timers, and local weekly timer.
- Configurable widget order, labels, minimal mode, multi-line output, OSC8
  links, flexible spacers/right alignment, path abbreviation, per-widget color
  overrides, custom command output, configurable Powerline separators/caps,
  width truncation, and JSON or plain output.
- Basic Jujutsu widgets for root, workspace, revision, description, bookmarks,
  changed files, insertions, and deletions.
- Presets for compact, dense, Git-focused, usage-focused, no-font,
  right-aligned, and multi-line layouts.
- tmux and Starship integration snippets, with optional `--write` install.
- Persistent Git cache with TTL and `.git/HEAD`/`.git/index` invalidation.
- Zero runtime dependencies; Node.js 20+ is enough.

## Quick Start

```sh
git clone https://github.com/Taylo0or/cxstatusline.git
cd cxstatusline
npm test
node ./bin/cxstatusline.js render --format plain
```

Install locally while developing:

```sh
npm link
cxstatusline configure --preset compact --theme powerline --yes
cxstatusline install hooks
cxstatusline install native
```

Use with tmux:

```sh
tmux set -g status-right '#(cxstatusline render --width 90)'
```

Generate or write tmux config:

```sh
cxstatusline install tmux --preset compact
cxstatusline install tmux --preset compact --write
```

Generate or write Starship config:

```sh
cxstatusline install starship --preset compact
cxstatusline install starship --preset compact --write
```

Use with SketchyBar:

```sh
open docs/integrations/sketchybar.md
```

Use with any shell prompt:

```sh
cxstatusline render --format plain
```

## Codex Native Footer

Codex supports a built-in configurable footer through `~/.codex/config.toml`:

```toml
[tui]
status_line = ["model-with-reasoning", "context-used", "used-tokens", "project-name", "git-branch", "run-state"]
status_line_use_colors = true
```

`cxstatusline install native` writes that block for you. You can choose items:

```sh
cxstatusline install native --items model-with-reasoning,context-used,git-branch,run-state
```

List known native Codex items:

```sh
cxstatusline native-items
```

## Hook Collector

`cxstatusline install hooks` writes `~/.codex/hooks.json` entries for:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `PreCompact`
- `PostCompact`
- `SubagentStart`
- `SubagentStop`
- `Stop`

The hook command uses a short one-second timeout and writes state to:

```text
~/.cache/cxstatusline/state.json
```

The renderer reads that state and combines it with live Git and local Codex
config data.

Codex requires non-managed hooks to be reviewed and trusted before they run.
After installing hooks, open `/hooks` inside Codex if Codex reports that new
hooks need review.

## Configuration

Open the interactive configurator:

```sh
cxstatusline configure
```

Create the config:

```sh
cxstatusline init
```

Edit:

```text
~/.config/cxstatusline/config.json
```

Example:

```json
{
  "theme": "powerline",
  "mode": "powerline",
  "minimal": false,
  "widgets": [
    { "type": "model", "label": "Model" },
    { "type": "reasoning", "label": "Think" },
    { "type": "project", "label": "Project" },
    { "type": "gitBranch", "label": "Git" },
    { "type": "gitStatus", "label": "" },
    { "type": "contextBar", "label": "Ctx", "width": 12 },
    { "type": "tokens", "label": "Tokens" },
    { "type": "duration", "label": "Time" },
    { "type": "runState", "label": "" }
  ]
}
```

List widgets:

```sh
cxstatusline widgets
```

List presets:

```sh
cxstatusline presets
```

## Commands

```text
cxstatusline render [--format plain|ansi|json] [--theme name] [--mode powerline|plain]
cxstatusline hook
cxstatusline configure
cxstatusline init [--force] [--preset default|compact|dense|git|usage|nofont|right|multiline]
cxstatusline install [all|hooks|native|config|tmux|starship] [--dry-run] [--write]
cxstatusline uninstall [hooks|native|tmux|starship]
cxstatusline widgets
cxstatusline presets
cxstatusline native-items
cxstatusline themes
cxstatusline bench [--iterations 500] [--max-avg-ms 5]
cxstatusline doctor
cxstatusline reset
```

## Compatibility With ccstatusline

`cxstatusline` aims to cover the same product surface: themes, Powerline output,
widget composition, Git metrics, model/session data, usage/context displays,
custom text, width handling, and an install flow.

There is one platform constraint: Codex currently has native fixed footer items
but does not expose a Claude-style external statusline command that receives
live status JSON on every refresh. For now, the richer renderer is designed for
external bars and prompts. If Codex adds command-backed statusline support later,
the renderer can be wired directly into it.

`cxstatusline` also ships compatibility aliases for many `ccstatusline` widget
names, so existing layouts can usually be translated by changing the command and
keeping equivalent widget names where Codex exposes the data.

See [docs/roadmap.md](docs/roadmap.md) for the full parity plan.
See [docs/parity.md](docs/parity.md) for the current ccstatusline compatibility
matrix.

## Development

```sh
npm test
npm run lint
node ./bin/cxstatusline.js doctor
```

## License

MIT
