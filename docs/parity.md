# ccstatusline Parity

`cxstatusline` targets feature parity with `ccstatusline` where Codex exposes
equivalent data or extension points.

## Supported

- Native Codex footer configuration through `[tui].status_line`.
- Codex hook collector and external renderer for tmux, Starship, SketchyBar,
  prompts, and command runners.
- Powerline and plain renderers.
- Custom Powerline separators and caps.
- Built-in themes and per-widget foreground/background overrides.
- Multi-line rendering.
- Flexible spacer/right-aligned plain rendering.
- Width truncation and explicit width override.
- JSON, ANSI, and plain output modes.
- Interactive and non-interactive configuration command.
- Presets for compact, dense, Git, usage, no-font, right-aligned, and
  multi-line layouts.
- Custom text, custom symbol, custom command, and OSC8 link widgets.
- Git branch, SHA, status, clean/dirty, staged, unstaged, untracked, conflicts,
  ahead/behind, insertions, deletions, origin, upstream, worktree, clickable
  branch links, and GitHub/GitLab PR/MR widgets.
- Persistent Git cache with TTL plus `.git/HEAD` and `.git/index`
  invalidation.
- Current directory path abbreviation, segment limiting, and fish-style path
  shortening.
- Token, input token, output token, cached token, cache-read token,
  cache-write token, context, context bar, context window, cost, usage
  remaining/utilization, token speed, input speed, and output speed widgets
  when Codex hook/transcript data provides the underlying fields.
- Five-hour block timer and local weekly timer widgets.
- Session id, run state, last event, last tool, compaction count, duration,
  memory, and terminal width widgets.
- Basic Jujutsu workspace, revision, description, bookmarks, and change widgets.
- Hook/native/tmux/Starship install and uninstall flows.
- Doctor, reset, and benchmark commands.
- GitHub CI and release workflow, including optional npm publish when
  `NPM_TOKEN` is configured.

## Codex Platform Limits

These `ccstatusline` features depend on Claude Code interfaces that Codex does
not currently expose in an equivalent form:

- A command-backed in-TUI external `statusLine.command`.
- `statusLine.refreshInterval` for external renderers inside Codex.
- ANSI-preserving custom segments inside Codex's native footer.
- Claude account email, Claude voice status, Claude vim mode, and
  Claude-specific skill metrics.
- Claude Sonnet/Opus weekly usage buckets and Anthropic extra-usage API data.

Where Codex provides equivalent fields through hooks, transcripts, or native
footer items, `cxstatusline` renders them. Where Codex does not provide the
data, the matching widget stays empty instead of inventing values.

## Remaining Enhancements

- Richer full-screen TUI configuration editor.
- More complete Jujutsu diff/bookmark metadata.
- Benchmark scenario suite with enforceable thresholds in CI.
- Optional npm trusted publishing setup after repository credentials are
  configured.
