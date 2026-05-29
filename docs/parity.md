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
- External refresh interval configuration for status surfaces that support it,
  including tmux `status-interval` generation.
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
  compaction-counter, separator, and flex-separator compatibility.
- `ccstatusline` settings import for lines, minimalist mode, terminal width
  options, global formatting, widget merge/bold flags, Git and Link widget
  metadata, separators, Git cache TTL, Powerline options, common widget
  metadata, and named colors.
- Custom text, custom symbol, custom command with render-context JSON on stdin,
  timeout, max-width, `commandPath` compatibility, and optional ANSI
  preservation, and OSC8 link widgets including `metadata.url`/`metadata.text`
  compatibility.
- Git branch, SHA, status, clean/dirty, staged, unstaged, untracked, conflicts,
  ahead/behind, insertions, deletions, origin, upstream owner/repo, tracking
  remote fallback, fork status, upstream-style branch/worktree icon/raw/no-git
  rendering, clickable branch and remote owner/repo links, Git root directory
  IDE links for VS Code and Cursor, remote and non-Git empty-state hiding,
  `ownerOnlyWhenFork`, `hideWhenNotFork`, and GitHub/GitLab PR/MR widgets with
  combined status/title/raw display controls.
- Persistent Git cache with TTL plus `.git/HEAD` and `.git/index`
  invalidation.
- Current directory path abbreviation, segment limiting, fish-style path
  shortening, and `ccstatusline` path metadata aliases.
- Token, input token, output token, cached token, cache-read token,
  cache-write token, context, context percentage aliases, context bar, context
  window, cost, usage remaining/utilization, session usage, weekly usage,
  weekly Sonnet/Opus usage, token speed, input speed, output speed, and total
  speed widgets when Codex hook/transcript data provides the underlying fields,
  including upstream-compatible usage/context display metadata for progress,
  progress-short, slider, slider-only, inverted, and cursor-marked displays,
  upstream-style Context Bar detail displays, plus extra usage disabled-state
  hiding.
- Five-hour block timer, reset timer, and local weekly timer widgets, including
  Block Timer compact/progress/slider modes and reset timestamp, time zone,
  locale, 12/24-hour, combined, progress/slider, and bar modes.
- Session id/name, version, output style, vim mode, voice status,
  remote-control status, skills, account email, run state, last event, last
  tool, compaction count, duration, memory, and terminal width widgets, with
  upstream-compatible default formats, raw/default label, Compaction Counter
  zero display, Nerd Font, and hide-zero controls where applicable, plus Skills
  mode/list-limit/hide-when-empty metadata.
- Jujutsu root, active workspace, revision, description, bookmark list,
  bookmark count, changed files, insertion/deletion summary, combined stats,
  insertion, and deletion widgets, including upstream-compatible `no jj`
  empty states and `hideNoJj` metadata.
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

- Complete `ccstatusline` TUI parity for the remaining widget-specific
  shortcuts beyond the currently supported Git, PR/MR, status-format, and
  empty-state toggles.
