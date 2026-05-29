# Roadmap

This project tracks feature parity with mature Claude Code statusline tools
while staying honest about Codex's current extension points.

## Implemented

- Codex hook collector.
- Native Codex `[tui].status_line` installer.
- Powerline and plain renderers.
- Theme system.
- JSON config.
- Interactive and non-interactive configuration command.
- Git branch, SHA, status, ahead/behind, and diff widgets.
- Git origin owner/repo, upstream, worktree, PR/MR detection, and clickable
  branch widgets.
- Rich GitHub/GitLab PR/MR state, review, branch, and diff-stat widgets.
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
- tmux, Starship, native footer, and hooks uninstall flows.
- SketchyBar integration docs.
- Persistent Git cache with TTL and `.git/HEAD`/`.git/index` invalidation.
- Width truncation.
- Doctor and reset commands.
- Runtime benchmark command.
- GitHub Actions CI and release workflow.

## Next

- Richer full-screen TUI configuration editor.
- Runtime benchmark suite with broader scenarios.
- npm publish credentials setup.

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
