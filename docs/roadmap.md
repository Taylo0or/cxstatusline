# Roadmap

This project tracks feature parity with mature Claude Code statusline tools
while staying honest about Codex's current extension points.

## Implemented

- Codex hook collector.
- Native Codex `[tui].status_line` installer.
- Powerline and plain renderers.
- Theme system.
- JSON config.
- Git branch, SHA, status, ahead/behind, and diff widgets.
- Git origin owner/repo, upstream, worktree, PR/MR detection, and clickable
  branch widgets.
- Model, reasoning, service tier, permission, sandbox, session, event, run-state,
  compaction, duration, memory, token, context, block timer, weekly timer, cost,
  and custom text widgets.
- Token speed samples from hook state.
- Multi-line rendering.
- OSC8 links.
- Flexible spacer/right alignment.
- Per-widget color overrides.
- Path abbreviation and fish-style path shortening.
- Presets for compact, dense, Git, usage, no-font, right-aligned, and multi-line
  layouts.
- tmux and Starship integration snippets, including optional config writes.
- Persistent Git cache with TTL and `.git/HEAD`/`.git/index` invalidation.
- Width truncation.
- Doctor and reset commands.

## Next

- Interactive TUI configuration editor.
- SketchyBar example.
- tmux config append/uninstall flow.
- Starship uninstall flow.
- GitHub/GitLab PR/MR richer status metadata.
- Runtime benchmark suite.
- npm publish workflow.
- GitHub Actions CI and release workflow.

## Waiting On Codex Support

These are equivalent to `ccstatusline` features but require deeper Codex support
to work inside the Codex TUI footer itself:

- External command-backed statusline rendering inside Codex.
- ANSI-preserving custom footer segments inside Codex.
- Refresh interval control for an external statusline command.
- Stable live status JSON containing complete token, context, rate-limit, and
  cost fields.

Until then, `cxstatusline` exposes those richer features to external terminal
status surfaces and configures Codex's native fixed footer items separately.
