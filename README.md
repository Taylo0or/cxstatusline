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
- Git widgets: branch, SHA, status indicators, clean/dirty state,
  staged/unstaged/untracked/conflict counts, ahead/behind, insertions,
  deletions, upstream-style diff count rendering, origin owner/repo, upstream,
  worktree and branch icon/main/raw rendering, mode/branch, fork status,
  clickable Git branch and
  remote owner/repo links for GitHub, GitLab, and compatible self-hosted
  remotes, IDE links for Git root directories, upstream tracking-remote
  fallback, empty-state controls for non-Git and remote widgets,
  `hideWhenNotFork` fork visibility controls, and
  PR/MR metadata through `gh`/`glab` when available, including combined
  status/title display controls.
- Codex/session widgets: model, reasoning effort, service tier, permission mode,
  sandbox mode, session id/name, output style, vim/voice/remote-control status
  when present with upstream-compatible default/raw rendering, default formats,
  thinking-effort normalization, transcript fallback, and Nerd Font controls,
  skills with mode/list-limit/hide-when-empty metadata, run state, last event,
  last tool, compaction count with upstream-compatible default zero display,
  format/Nerd Font, and hide-zero controls,
  duration, version, and terminal width with upstream-compatible raw/default
  labels, and best-effort token/context/cost metrics when
  Codex exposes them through hook payloads or transcript entries.
- Usage widgets: token/input/output/total speed, session and weekly usage,
  Sonnet/Opus weekly usage when available, upstream-style token and context
  default/raw labels, context used/remaining/window,
  context bars with upstream-compatible detail display modes (`progress`,
  `progress-short`, `slider`, `slider-only`), percent display modes with
  invert/cursor controls, extra usage disabled-state hiding,
  cached/cache-read/cache-write tokens,
  five-hour block timer with compact/progress/slider modes, reset timers with
  timestamp/time zone aliases and progress/slider modes, and local weekly timer.
- Configurable widget order, labels, minimal mode, multi-line output, OSC8
  links including `ccstatusline` Link metadata, flexible spacers/right
  alignment, manual separator collapse, path abbreviation, default
  padding/separator controls, inherited separator colors, global bold and color
  overrides, widget merge/no-padding modes, per-widget color overrides,
  per-widget max-width truncation, custom command output with render-context
  JSON on stdin, timeout, max-width, and optional ANSI color preservation,
  configurable Powerline separators/caps,
  multi-separator and inverted Powerline separator support,
  multi-cap/codepoint Powerline caps, multi-line Powerline auto-alignment,
  theme continuation, terminal width modes, width truncation, and JSON or plain
  output.
- `ccstatusline` widget-name aliases for common kebab-case types such as
  `git-branch`, `tokens-total`, `current-working-dir`, `git-pr`,
  `compaction-counter`, `weekly-sonnet-usage`, `separator`, and
  `flex-separator`.
- Jujutsu widgets for root, active workspace, revision, description,
  bookmarks, bookmark count, changed files, insertion/deletion summary,
  combined stats, insertions, deletions, and `hideNoJj` empty-state controls.
- Presets for compact, dense, Git-focused, usage-focused, no-font,
  right-aligned, and multi-line layouts.
- Full-screen terminal configuration editor with live preview, widget picker,
  line editing, widget-specific option editing, per-widget color editing,
  global options, terminal width controls, Powerline controls, install/update
  management, and save-time hook/native install toggles.
- External refresh interval configuration for status surfaces that support it,
  including generated tmux `status-interval` snippets.
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

Force a render width with either native or compatibility environment variables:

```sh
CXSTATUSLINE_WIDTH=90 cxstatusline render
CCSTATUSLINE_WIDTH=90 cxstatusline render
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

Open the full-screen configuration editor:

```sh
cxstatusline tui
cxstatusline configure --tui
```

Open the prompt-based configurator:

```sh
cxstatusline configure
```

Persist a specific layout without prompts:

```sh
cxstatusline configure --widgets model,git-branch,tokens-total --separator " :: " --yes
cxstatusline configure --flex-mode full-until-compact --compact-threshold 70 --yes
cxstatusline configure --refresh-interval 10 --yes
cxstatusline configure --mode plain --default-padding " " --global-bold --override-fg cyan --yes
cxstatusline configure --powerline-separators "U+E0B0,U+E0B1" --powerline-auto-align --yes
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
    { "type": "gitBranch", "label": "Git", "linkToRepo": true },
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

Render with `ccstatusline`-style widget names:

```sh
cxstatusline render --format plain --widgets model,git-branch,tokens-total,current-working-dir
```

Use `ccstatusline`-style Git link metadata:

```json
{
  "widgets": [
    { "type": "gitBranch", "linkToRepo": true, "hideNoGit": true },
    { "type": "gitOriginOwnerRepo", "linkToRepo": true, "ownerOnlyWhenFork": true, "hideNoRemote": true },
    { "type": "gitRootDir", "linkToIDE": "cursor" },
    { "type": "gitIsFork", "hideWhenNotFork": true }
  ]
}
```

Use `ccstatusline`-style path abbreviation metadata:

```json
{ "type": "current-working-dir", "metadata": { "segments": "2", "fishStyle": "true" } }
```

Use `ccstatusline`-style Link metadata:

```json
{ "type": "link", "metadata": { "url": "https://example.com/docs", "text": "Docs" } }
```

Hide Jujutsu non-repository empty states with `ccstatusline`-style metadata:

```json
{ "type": "jjWorkspace", "metadata": { "hideNoJj": "true" } }
```

Custom command widgets receive render context JSON on stdin:

```json
{ "type": "command", "command": "node ./scripts/status-summary.js" }
```

Render reset timers as exact timestamps:

```sh
cxstatusline render --format plain --widgets reset-timer --config ~/.config/cxstatusline/config.json
```

Example widget config:

```json
{ "type": "blockResetTimer", "format": "timestamp", "timeZone": "UTC", "hour12": false }
{ "type": "reset-timer", "metadata": { "absolute": "true", "timezone": "UTC" } }
```

Render usage or context percentages with `ccstatusline` display metadata:

```json
{ "type": "sessionUsage", "metadata": { "display": "progress-short", "invert": "true" } }
{ "type": "contextPercentage", "metadata": { "display": "slider", "cursor": "true" } }
{ "type": "extraUsageUtilization", "metadata": { "display": "slider-only", "hideIfDisabled": "true" } }
```

Use `ccstatusline`-style Skills metadata:

```json
{ "type": "skills", "metadata": { "mode": "list", "listLimit": "2", "hideWhenEmpty": "true" } }
```

Import an existing `ccstatusline` config:

```sh
cxstatusline import ccstatusline --dry-run
cxstatusline import ccstatusline
```

List presets:

```sh
cxstatusline presets
```

Check or pin the global install to a release tag:

```sh
cxstatusline update-check
cxstatusline self-update --dry-run
cxstatusline self-update --tag v0.2.24
```

## Commands

```text
cxstatusline render [--format plain|ansi|json] [--theme name] [--mode powerline|plain]
cxstatusline hook
cxstatusline configure [--preset name] [--theme name] [--mode name] [--widgets csv] [--flex-mode mode] [--tui]
cxstatusline tui [--config path]
cxstatusline import ccstatusline [--from path] [--dry-run]
cxstatusline init [--force] [--preset default|compact|dense|git|usage|nofont|right|multiline]
cxstatusline install [all|hooks|native|config|tmux|starship] [--dry-run] [--write] [--refresh-interval seconds]
cxstatusline uninstall [hooks|native|tmux|starship]
cxstatusline widgets
cxstatusline presets
cxstatusline native-items
cxstatusline themes
cxstatusline bench [--iterations 500] [--max-avg-ms 5]
cxstatusline update-check [--json]
cxstatusline self-update [--dry-run] [--tag v0.2.24]
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
npm run bench:ci
node ./bin/cxstatusline.js doctor
```

## License

MIT
