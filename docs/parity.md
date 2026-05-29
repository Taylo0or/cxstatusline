# ccstatusline Parity

`cxstatusline` targets feature parity with `ccstatusline` where Codex exposes
equivalent data or extension points.

## Supported

- Native Codex footer configuration through `[tui].status_line`.
- Codex hook collector and external renderer for tmux, Starship, SketchyBar,
  prompts, and command runners.
- Powerline and plain renderers.
- Custom Powerline separators and caps, including multiple separators, inverted
  separator backgrounds, multiple caps, and Unicode codepoint input.
- Built-in themes, global plain formatting overrides, inherited separator
  colors, plain/Powerline widget merges including no-padding mode, and
  per-widget foreground/background overrides and max-width truncation.
- Multi-line rendering with manual separator collapse around empty widgets,
  Powerline auto-alignment, and optional theme continuation across lines.
- Flexible spacer/right-aligned plain rendering.
- Width truncation, terminal width modes, `compactThreshold`, and explicit
  width override through `CXSTATUSLINE_WIDTH` or the `CCSTATUSLINE_WIDTH`
  compatibility alias.
- JSON, ANSI, and plain output modes.
- Interactive and non-interactive configuration command, including widget,
  separator, terminal width, global formatting, Powerline separator, and
  Powerline alignment flags.
- Core full-screen TUI configuration editor with live preview, main menu,
  widget picker, line editor, widget-specific option editor, per-widget color
  editor, preset/theme/mode selection, terminal width options, global
  formatting options, Powerline options, install/update management, and
  save-time hook/native install toggles.
- Presets for compact, dense, Git, usage, no-font, right-aligned, and
  multi-line layouts.
- `ccstatusline` kebab-case widget aliases for migrated widget lists, including
  separator and flex-separator compatibility.
- `ccstatusline` settings import for lines, minimalist mode, terminal width
  options, global formatting, widget merge/bold flags, separators, Git cache
  TTL, Powerline options, common widget metadata, and named colors.
- Custom text, custom symbol, custom command with timeout, max-width, and
  optional ANSI preservation, and OSC8 link widgets.
- Git branch, SHA, status, clean/dirty, staged, unstaged, untracked, conflicts,
  ahead/behind, insertions, deletions, origin, upstream owner/repo, fork status,
  worktree, clickable branch links, and GitHub/GitLab PR/MR widgets.
- Persistent Git cache with TTL plus `.git/HEAD` and `.git/index`
  invalidation.
- Current directory path abbreviation, segment limiting, and fish-style path
  shortening.
- Token, input token, output token, cached token, cache-read token,
  cache-write token, context, context percentage aliases, context bar, context
  window, cost, usage remaining/utilization, session usage, weekly usage,
  weekly Sonnet/Opus usage, token speed, input speed, output speed, and total
  speed widgets when Codex hook/transcript data provides the underlying fields.
- Five-hour block timer, reset timer, and local weekly timer widgets, including
  reset timestamp, time zone, locale, 12/24-hour, combined, and bar modes.
- Session id/name, version, output style, vim mode, voice status,
  remote-control status, skills, account email, run state, last event, last
  tool, compaction count, duration, memory, and terminal width widgets.
- Jujutsu root, active workspace, revision, description, bookmark list,
  bookmark count, changed files, insertion/deletion summary, combined stats,
  insertion, and deletion widgets.
- Hook/native/tmux/Starship install and uninstall flows.
- GitHub release update checks and pinned global install commands through CLI
  and the full-screen TUI.
- Doctor, reset, benchmark commands, and CI benchmark thresholds.
- GitHub CI and release workflow, including optional npm publish with
  `NPM_TOKEN` or npm trusted publishing when repository settings are configured.

## Codex Platform Limits

These `ccstatusline` features depend on Claude Code interfaces that Codex does
not currently expose in an equivalent form:

- A command-backed in-TUI external `statusLine.command`.
- `statusLine.refreshInterval` for external renderers inside Codex.
- ANSI-preserving custom segments inside Codex's native footer.
- Native Codex equivalents for Claude account email, Claude voice status,
  Claude vim mode, and Claude-specific skill metrics.
- Claude Sonnet/Opus weekly usage buckets and Anthropic extra-usage API data
  unless equivalent values appear in Codex hooks or transcripts.

Where Codex provides equivalent fields through hooks, transcripts, or native
footer items, `cxstatusline` renders them. Where Codex does not provide the
data, the matching widget stays empty instead of inventing values.

## Remaining Enhancements

- Complete `ccstatusline` TUI parity for refresh-interval management and the
  remaining widget-specific shortcuts that require renderer support.
