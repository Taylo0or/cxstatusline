# Changelog

## 0.2.51

- Aligned Git diff count widgets with upstream `ccstatusline`: `gitChanges`
  now renders `(+insertions,-deletions)`, and `gitInsertions`/`gitDeletions`
  keep explicit `+0`/`-0` output when no lines changed.

## 0.2.50

- Aligned Git status widgets with upstream `ccstatusline`: compact status
  indicators, clean `✓`/dirty `✗`, boolean staged/unstaged/untracked symbols,
  prefixed file counts, conflict counts, and arrow-style ahead/behind output.

## 0.2.49

- Aligned Git Branch rendering with upstream `ccstatusline`: default `⎇`
  prefix, raw branch output, linked branch text, and `⎇ no git` empty state.

## 0.2.48

- Aligned Voice Status with upstream `ccstatusline`: default `icon` format,
  invalid-format fallback, raw `on`/`off` rendering, and icon-first TUI format
  cycling.

## 0.2.47

- Aligned Compaction Counter defaults with upstream `ccstatusline`: render
  `icon-space-number` by default and show zero counts unless `hideZero` is set.
- Preserved Compaction Counter format, Nerd Font, and hide-zero controls across
  render, settings import, and the full-screen TUI.

## 0.2.46

- Added upstream-compatible Block Timer `metadata.display` rendering for
  progress, progress-short, slider, and slider-only modes.
- Added Block Timer raw/default labels, compact time formatting, inverted
  progress rendering, settings import preservation, and TUI controls.

## 0.2.45

- Added upstream-compatible raw/default labels for `sessionClock`, `version`,
  and `terminalWidth` widgets.
- Extracted `total_duration_ms` style hook payload fields for Session Clock
  duration rendering.

## 0.2.44

- Added upstream-compatible Context Bar `metadata.display` detail rendering for
  progress, progress-short, slider, and slider-only modes.
- Supported raw Context Bar rendering without the `Context:` prefix while
  preserving the existing compact bar default.

## 0.2.43

- Added upstream-compatible Git Worktree rendering with the `𖠰` icon,
  `main` default, `rawValue` support, and `hideNoGit` empty-state metadata.
- Parsed linked Git worktree names from `git rev-parse --git-dir`, including
  nested and Windows-style worktree paths.

## 0.2.42

- Added upstream-compatible Skills widget `metadata.mode`,
  `metadata.listLimit`, and `metadata.hideWhenEmpty` rendering.
- Preserved Skills hide-when-empty metadata during `ccstatusline` settings
  import and exposed it in the full-screen TUI.

## 0.2.41

- Added `ccstatusline` path widget metadata aliases for `segments`,
  `abbreviateHome`, and `fishStyle`.
- Preserved path abbreviation metadata during `ccstatusline` settings import
  and exposed the imported values in the full-screen TUI.

## 0.2.40

- Added upstream-compatible reset timer `metadata.display` progress and slider
  modes.
- Preserved and rendered reset timer `metadata.absolute` and
  `metadata.timezone` aliases from imported `ccstatusline` settings.

## 0.2.39

- Added upstream-compatible extra usage disabled-state handling with
  `hideIfDisabled` metadata.
- Added progress, slider, invert, and cursor display metadata support to
  `extraUsageUtilization`.

## 0.2.38

- Added upstream-compatible Jujutsu `no jj` empty states and `hideNoJj`
  metadata support for Jj widgets.
- Preserved `hideNoJj` during `ccstatusline` settings import and exposed it in
  the full-screen TUI.

## 0.2.37

- Added upstream-compatible `hideNoGit` rendering for Git widgets so non-Git
  directories can either show the matching no-git empty state or hide it.
- Added `gitIsFork` raw-value and `hideWhenNotFork` metadata support.
- Exposed Git no-git and fork visibility controls in the full-screen TUI.

## 0.2.36

- Added upstream-compatible usage/context display metadata for progress,
  progress-short, slider, slider-only, inverted, and cursor-marked percentage
  widgets.
- Exposed usage display, invert, and cursor controls in the full-screen TUI.

## 0.2.35

- Added upstream-compatible Git PR/MR display controls for combined status,
  title, and raw-number rendering.

## 0.2.34

- Added upstream-compatible status widget format options for Vim, voice,
  remote-control, and compaction widgets, including Nerd Font and hide-zero
  controls where applicable.

## 0.2.33

- Preserved successful custom command output when commands exit before reading
  all stdin payload bytes.

## 0.2.32

- Stabilized custom command stdin compatibility validation across CI runners.

## 0.2.31

- Passed render context JSON to custom command widgets via stdin, matching
  `ccstatusline` command chaining behavior.
- Added `commandPath` compatibility for imported or hand-written custom command
  widgets.
- Updated TUI command editing and preview helpers to understand `commandPath`.

## 0.2.30

- Added `ccstatusline`-style Link widget metadata support for `metadata.url`
  and `metadata.text`.
- Preserved Link widget URL/text metadata during `ccstatusline` settings
  import.
- Updated the full-screen TUI widget options to display imported Link metadata.

## 0.2.29

- Added `no remote` / `no upstream` empty-state rendering for Git remote
  widgets with `hideNoRemote` support.
- Added TUI widget-option controls for hiding Git remote empty states.
- Improved upstream remote detection by falling back to the current branch's
  tracking remote when no literal `upstream` remote is configured.

## 0.2.28

- Added `linkToIDE` support for `gitRootDir`, rendering repository root names
  as `vscode://file` or `cursor://file` OSC8 links.
- Preserved legacy `linkToCursor` metadata for Git root directory links.
- Exposed Git root IDE link mode cycling in the full-screen TUI widget options.

## 0.2.27

- Added `linkToRepo` rendering for Git branch, origin owner/repo, and upstream
  owner/repo widgets, including legacy `linkToGitHub` support for Git branch.
- Added self-hosted Git remote URL parsing for clickable Git widget links.
- Preserved Git link metadata during `ccstatusline` settings import and exposed
  Git link toggles in the full-screen TUI widget options.

## 0.2.26

- Added configurable external refresh intervals through
  `refreshIntervalSeconds`, `configure --refresh-interval`, and the full-screen
  TUI terminal options.
- Added tmux `status-interval` generation from refresh interval settings or
  install flags.
- Preserved `refreshInterval` from imported `ccstatusline` settings and wired
  configured Git cache TTL into render-time Git lookups.

## 0.2.25

- Added a Widget Options screen to the full-screen TUI.
- Added menu-driven editing for common widget options and type-specific
  controls, including command, link, CWD, usage/bar, reset timer, speed,
  skills, and format settings.

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
