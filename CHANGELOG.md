# Changelog

## 0.2.24

- Added GitHub release update checks through `cxstatusline update-check`.
- Added pinned global install command generation and `cxstatusline self-update`
  with dry-run support.
- Added an Install and Updates management page to the full-screen TUI.

## 0.2.23

- Added an Edit Widget Colors screen to the full-screen TUI.
- Added per-widget foreground, background, bold, and clear-style controls with
  live preview and multi-line navigation.

## 0.2.22

- Added `cxstatusline tui` and `cxstatusline configure --tui` for a
  full-screen terminal configuration editor.
- Added live preview, widget picker, multi-line widget editing, common
  per-widget edits, preset/theme/mode selection, terminal width controls,
  global formatting controls, Powerline controls, and save-time hook/native
  install toggles to the TUI.
- Documented the remaining advanced `ccstatusline` TUI parity gaps.

## 0.2.21

- Added per-widget `maxWidth` truncation with visible-width accounting.
- Added custom command max-width compatibility, including `width` as a
  command-only alias for imported or hand-written configs.
- Preserved `maxWidth` during `ccstatusline` settings import.

## 0.2.20

- Added Powerline widget merge support so `merge: true` suppresses the next
  Powerline separator and `merge: "no-padding"` also removes adjoining padding.
- Preserved `merge` and per-widget `bold` settings during `ccstatusline`
  settings import.

## 0.2.19

- Added ccstatusline-style terminal width modes with `flexMode` values
  `full`, `full-minus-40`, and `full-until-compact`.
- Added `compactThreshold` support so status lines can reserve room for compact
  messages after context usage crosses a configured percentage.
- Preserved `flexMode` and `compactThreshold` during `ccstatusline` settings
  import and exposed matching `configure` flags.

## 0.2.18

- Added ccstatusline-style global plain renderer options for default padding,
  default separators, inherited separator colors, global bold, and global
  foreground/background color overrides.
- Preserved ccstatusline global formatting options during settings import and
  exposed matching non-interactive `configure` flags.
- Added no-padding merge handling for adjacent plain widgets.

## 0.2.17

- Expanded `configure` so widget lists, plain separators, Powerline separator
  arrays, separator inversion, caps, auto-alignment, and theme continuation can
  be persisted from prompts or direct flags.
- Added optional npm trusted publishing support to the release workflow while
  retaining token-based publishing for repositories that use `NPM_TOKEN`.

## 0.2.16

- Added Powerline separator arrays with boundary-specific separators that reuse
  the final configured separator for longer lines.
- Added Powerline `separatorInvertBackground` rendering and preserved the flag
  array during `ccstatusline` settings import.

## 0.2.15

- Added multi-line Powerline auto-alignment with `powerline.autoAlign`.
- Added Powerline theme color continuation across lines with
  `powerline.continueThemeAcrossLines`.
- Preserved those Powerline flags during `ccstatusline` settings import.

## 0.2.14

- Collapsed leading, trailing, and duplicate manual separators when adjacent
  widgets render empty.
- Rendered manual separators without inserting extra automatic plain separators.
- Added `preserveColors` support for custom command widgets and preserved it
  during `ccstatusline` settings import.

## 0.2.13

- Improved Jujutsu workspace lookup to select the active working copy.
- Improved Jujutsu bookmarks to use bookmark heads and render cleaned
  comma-separated bookmark lists.
- Changed `jjChanges` to match ccstatusline-style insertion/deletion summaries.
- Added `jjChangedFiles`, `jjStats`, and `jjBookmarkCount` widgets.
- Added Jujutsu bookmark and change summary parser coverage.

## 0.2.12

- Added reset timer display modes for duration, timestamp, ISO timestamp,
  combined duration/timestamp, and progress bars.
- Added locale, time zone, 12/24-hour, and include-date options for reset timer
  timestamps.
- Preserved reset timer timestamp metadata when importing `ccstatusline`
  settings.

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
