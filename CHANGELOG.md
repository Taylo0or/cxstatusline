# Changelog

## 0.2.11

- Added `cxstatusline import ccstatusline` / `migrate ccstatusline` to convert
  `~/.config/ccstatusline/settings.json` into `cxstatusline` config.
- Converts ccstatusline lines, minimalist mode, separators, Git cache TTL,
  Powerline separators/caps, common widget metadata, and named widget colors.
- Added `--dry-run` support for previewing imported config JSON.

## 0.2.10

- Added `ccstatusline` widget-name compatibility for kebab-case types such as
  `git-branch`, `tokens-total`, `current-working-dir`, `git-pr`,
  `weekly-sonnet-usage`, and `worktree-original-branch`.
- Added `separator` and `flex-separator` compatibility widgets.

## 0.2.9

- Added a `bench:ci` benchmark scenario suite covering compact, usage, Git, and
  multi-line presets.
- Added benchmark threshold enforcement to CI and release workflows.

## 0.2.8

- Added `CCSTATUSLINE_WIDTH` as a compatibility alias for explicit render
  width.
- Added multi-cap Powerline start/end configuration and Unicode codepoint cap
  parsing such as `U+E0B0` or `0xE0B0`.

## 0.2.7

- Added more ccstatusline-compatible widget aliases for session ids, session
  names, version, context percentage, reset timers, clean Git status, and Git
  worktrees.
- Added session, weekly, Sonnet weekly, and Opus weekly usage widgets when hook
  state provides matching usage fields.
- Added best-effort output style, vim mode, voice status, remote-control
  status, skills, account email, and total speed widgets.
- Preserved optional hook metadata for session titles, UI state, skills, and
  account information.

## 0.2.6

- Added upstream remote owner/repo and fork-status Git widgets.
- Added Git root dir, staged/unstaged/untracked file aliases, and worktree
  branch widgets.
- Added Jujutsu root, insertion, and deletion widgets.

## 0.2.5

- Added ccstatusline parity matrix documentation.

## 0.2.4

- Added custom command widget.
- Added input/output token speed widgets and cache token widgets.
- Added generic usage remaining/utilization widgets.
- Added terminal-width and basic Jujutsu widgets.
- Added configurable Powerline separators and caps.

## 0.2.3

- Added richer GitHub/GitLab pull request and merge request metadata widgets.
- Added benchmark threshold support with `--max-avg-ms`.

## 0.2.2

- Added uninstall support for native Codex footer, tmux, and Starship config.
- Added `bench` command for render performance checks.
- Added SketchyBar integration docs.
- Added GitHub release workflow with optional npm publishing.

## 0.2.1

- Added interactive and non-interactive `configure` command.

## 0.2.0

- Added persistent Git cache with TTL and `.git/HEAD`/`.git/index`
  invalidation.
- Added per-widget color overrides.
- Added flexible spacer/right-aligned plain rendering.
- Added path abbreviation and fish-style path shortening.
- Added context token widgets, five-hour block timer widgets, and local weekly
  timer widgets.
- Added dense, no-font, and right-aligned presets.
- Added optional tmux and Starship config write support.

## 0.1.0

- Initial `cxstatusline` CLI.
- Added Codex hook collector and state renderer.
- Added Codex native `[tui].status_line` installer.
- Added Powerline/plain renderers and five themes.
- Added Git, Codex session, usage, context, system, and custom text widgets.
- Added tests, README, roadmap, and CI workflow.
