# Roadmap

This project tracks feature parity with mature Claude Code statusline tools
while staying honest about Codex's current extension points.

## Implemented

- Codex hook collector.
- Native Codex `[tui].status_line` installer.
- Powerline and plain renderers.
- Theme system.
- JSON config.
- Interactive and non-interactive configuration command, including direct
  widget, separator, terminal width, global formatting, Powerline separator,
  and Powerline alignment flags.
- Git branch, SHA, status, ahead/behind, and diff widgets.
- Git origin owner/repo, upstream owner/repo, fork status, worktree, PR/MR
  detection, clickable branch widgets, clickable Git remote owner/repo widgets,
  Git root directory IDE links, and `ownerOnlyWhenFork`.
- Rich GitHub/GitLab PR/MR state, review, branch, and diff-stat widgets.
- Model, reasoning, service tier, permission, sandbox, session, event, run-state,
  session name, output style, vim mode, voice status, remote-control status,
  skills, account email, compaction, duration, memory, token, context, usage,
  block timer, weekly timer, cost, and custom text widgets.
- Token speed, input speed, output speed, total speed, usage, weekly usage,
  reset timer timestamp modes, and cache token widgets from hook state.
- Custom command widget with timeout, max-width, and optional ANSI preservation.
- Jujutsu root, active workspace, revision, description, bookmark list,
  bookmark count, changed files, insertion/deletion summary, combined stats,
  insertion, and deletion widgets.
- Multi-line rendering with manual separator collapse around empty widgets,
  Powerline auto-alignment, and optional theme continuation across lines.
- OSC8 links and custom command ANSI color preservation.
- Configurable Powerline separators, multi-separator arrays, inverted separator
  backgrounds, and multi-cap/codepoint caps.
- Flexible spacer/right alignment.
- Global default padding/separators, inherited separator colors, global bold and
  color overrides, plain/Powerline widget merges including no-padding mode, and
  per-widget color overrides and max-width truncation.
- Terminal width modes, compact thresholds, width truncation, and
  `CXSTATUSLINE_WIDTH`/`CCSTATUSLINE_WIDTH` overrides.
- External refresh interval configuration for tmux and other external status
  surfaces that honor their own refresh cadence.
- Path abbreviation and fish-style path shortening.
- `ccstatusline` kebab-case widget aliases for migrated widget lists.
- `ccstatusline` settings import for common layout and widget options.
- Presets for compact, dense, Git, usage, no-font, right-aligned, and multi-line
  layouts.
- Full-screen TUI configuration editor with live preview, widget picker, line
  editor, widget-specific option editor including Git link and IDE-link toggles,
  per-widget color editor,
  preset/theme/mode selection, terminal width controls, global formatting
  controls, Powerline controls, install/update management, and save-time
  hook/native install toggles.
- tmux and Starship integration snippets, including optional config writes.
- tmux, Starship, native footer, and hooks uninstall flows.
- GitHub release update checks and pinned global install commands.
- SketchyBar integration docs.
- Persistent Git cache with TTL and `.git/HEAD`/`.git/index` invalidation.
- Doctor and reset commands.
- Runtime benchmark command and CI benchmark scenario suite.
- GitHub Actions CI and release workflow with optional npm token or trusted
  publishing.

## Next

- Complete advanced `ccstatusline` TUI parity for the remaining
  widget-specific shortcut editors that require renderer support.

## Waiting On Codex Support

These are equivalent to `ccstatusline` features but require deeper Codex support
to work inside the Codex TUI footer itself:

- External command-backed statusline rendering inside Codex.
- ANSI-preserving custom footer segments inside Codex.
- Refresh interval control for an external statusline command inside the Codex
  native footer.
- Stable live status JSON containing complete token, context, rate-limit,
  account, voice, vim, skill, and cost fields.

Until then, `cxstatusline` exposes those richer features to external terminal
status surfaces and configures Codex's native fixed footer items separately.
