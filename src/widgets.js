import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import os from "node:os";
import { basename, join } from "node:path";
import { compactNumber, formatDuration, homePath, readJson, repoRoot, run, stripAnsi } from "./util.js";

export const SPACER = "__CXSTATUSLINE_SPACER__";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CONTEXT_WINDOW = 200_000;
const PACKAGE = readJson(join(repoRoot, "package.json"), {});
const VIM_ICON = "v";
const VIM_NERD_FONT_ICON = "\uE62B";
const VOICE_ICON = "\u{1F3A4}";
const VOICE_NERD_FONT_ON = "\uF130";
const VOICE_NERD_FONT_OFF = "\uF131";
const REMOTE_ICON = "\u{1F4E1}";
const REMOTE_NERD_FONT_ON = "\uF1EB";
const REMOTE_NERD_FONT_OFF = "\uF6AC";
const COMPACTION_ICON = "\u21BB";
const COMPACTION_NERD_FONT_ICON = "\uF021";
const STATUS_DOT_ON = "\u25C9";
const STATUS_DOT_OFF = "\u25CB";
const JJ_BOOKMARK_ICON = "\u{1F516}";
const JJ_WORKSPACE_ICON = "\u25C6";
const JJ_REVISION_ICON = "\uF1FA";
const GIT_BRANCH_ICON = "\u2387";
const WORKTREE_ICON = "\u{16830}";
const KNOWN_THINKING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const MODEL_STDOUT_PREFIX = "<local-command-stdout>Set model to ";
const MODEL_STDOUT_EFFORT_REGEX = /^<local-command-stdout>Set model to[\s\S]*? with ([a-zA-Z0-9-]+) effort<\/local-command-stdout>$/i;
const EFFORT_STDOUT_PREFIX = "<local-command-stdout>Set effort level to ";
const EFFORT_STDOUT_REGEX = /^<local-command-stdout>Set effort level to ([a-zA-Z0-9-]+)\b/i;
const UNKNOWN_EFFORT_PATTERN = /^(?=.*[a-z0-9])[a-z0-9-]{2,20}$/;
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;
const THINKING_EFFORT_CACHE = new Map();

const WIDGET_ALIASES = {
  "current-working-dir": "cwd",
  "tokens-total": "tokens",
  "tokens-input": "inputTokens",
  "tokens-output": "outputTokens",
  "tokens-cached": "cachedTokens",
  "cache-read-tokens": "cacheReadTokens",
  "cache-write-tokens": "cacheWriteTokens",
  "session-cost": "cost",
  "reset-timer": "blockResetTimer",
  "free-memory": "memory",
  "thinking-effort": "reasoning",
  "compaction-counter": "compactions",
  "git-review": "gitPullRequest",
  "git-pr": "gitPullRequest",
  "git-pull-request": "gitPullRequest",
  "git-pr-state": "gitPullRequestState",
  "git-pr-review": "gitPullRequestReview",
  "git-pr-stats": "gitPullRequestStats",
  "git-pr-branches": "gitPullRequestBranches",
  "worktree-mode": "gitWorktreeMode",
  "worktree-name": "gitWorktreeName",
  "worktree-branch": "gitWorktreeBranch",
  "worktree-original-branch": "gitWorktreeOriginalBranch",
  "flex-separator": "spacer",
  "custom-text": "text",
  "custom-symbol": "symbol",
  "custom-command": "command"
};

export const widgetRegistry = {
  appName: {
    description: "Codex application label",
    render: () => "Codex"
  },
  model: {
    description: "Active Codex model from hook state or config",
    render: ({ state, codexConfig, widget }) => {
      const model = formatModelName(state.model || codexConfig.model || process.env.CODEX_MODEL || "");
      return model ? formatRawOrLabeledValue(widget, "Model: ", model) : "";
    }
  },
  reasoning: {
    description: "Configured model reasoning effort",
    render: ({ state, codexConfig, widget }) => formatRawOrLabeledValue(widget, "Thinking: ", formatThinkingEffort(resolveThinkingEffort(state, codexConfig)))
  },
  serviceTier: {
    description: "Configured Codex service tier",
    render: ({ codexConfig }) => codexConfig.service_tier || codexConfig.serviceTier || ""
  },
  permissionMode: {
    description: "Current Codex permission mode from hook state",
    render: ({ state }) => state.permissionMode || ""
  },
  sandboxMode: {
    description: "Configured Codex sandbox mode",
    render: ({ codexConfig }) => codexConfig.sandbox_mode || codexConfig.sandboxMode || ""
  },
  project: {
    description: "Git root name or current directory name",
    render: ({ git, cwd }) => git.rootName || basename(cwd || process.cwd())
  },
  gitRootDir: {
    description: "Git repository root directory name",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget, "no git");
      const text = rootDirName(git.root) || git.rootName || "";
      if (!text) return "";
      const mode = ideLinkMode(widget);
      if (!mode || !git.root) return text;
      return osc8(buildIdeFileUrl(git.root, mode), text);
    }
  },
  cwd: {
    description: "Current working directory",
    render: ({ cwd, widget }) => formatPath(cwd || process.cwd(), widget)
  },
  path: {
    description: "Alias for current working directory with path controls",
    render: ({ cwd, widget }) => formatPath(cwd || process.cwd(), widget)
  },
  gitBranch: {
    description: "Current Git branch",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget, `${GIT_BRANCH_ICON} no git`);
      if (!git.branch || git.branch === "(detached)") return gitNoGit(widget, `${GIT_BRANCH_ICON} no git`);
      const text = formatGitBranch(git.branch, widget);
      if (git.branch !== "(detached)" && gitBranchLinkEnabled(widget)) {
        return osc8(branchWebUrl(git.origin, git.branch), text) || text;
      }
      return text;
    }
  },
  gitSha: {
    description: "Short Git commit SHA",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return git.sha || gitNoGit(widget, "(no commit)");
    }
  },
  gitStatus: {
    description: "Staged, unstaged, untracked, and conflict counts",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitStatusIndicators(git.status);
    }
  },
  gitStaged: {
    description: "Staged changes indicator",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitFlag(git.status.staged, widget, "+");
    }
  },
  gitStagedFiles: {
    description: "Number of staged files",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitCount("S", git.status.staged, widget);
    }
  },
  gitUnstaged: {
    description: "Unstaged changes indicator",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitFlag(git.status.unstaged, widget, "*");
    }
  },
  gitUnstagedFiles: {
    description: "Number of unstaged files",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitCount("M", git.status.unstaged, widget);
    }
  },
  gitUntracked: {
    description: "Untracked files indicator",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitFlag(git.status.untracked, widget, "?");
    }
  },
  gitUntrackedFiles: {
    description: "Number of untracked files",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitCount("?", git.status.untracked, widget);
    }
  },
  gitConflicts: {
    description: "Number of merge conflict files",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      const count = Number(git.status.conflicts || 0);
      return widget.rawValue || widget.label === "" ? String(count) : `\u26A0 ${count}`;
    }
  },
  gitClean: {
    description: "Git clean or dirty state",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitClean(git.status.clean, widget);
    }
  },
  gitCleanStatus: {
    description: "Git clean or dirty state",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitClean(git.status.clean, widget);
    }
  },
  gitAheadBehind: {
    description: "Git upstream ahead and behind counts",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      if (!git.upstream && !git.status.ahead && !git.status.behind) return gitNoGit(widget, "(no upstream)");
      return formatGitAheadBehind(git.status, widget);
    }
  },
  gitChanges: {
    description: "Uncommitted insertions and deletions",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return formatGitChanges(git);
    }
  },
  gitInsertions: {
    description: "Uncommitted insertion count",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return `+${gitChangeCounts(git).insertions}`;
    }
  },
  gitDeletions: {
    description: "Uncommitted deletion count",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      return `-${gitChangeCounts(git).deletions}`;
    }
  },
  gitOriginOwner: {
    description: "Origin remote owner",
    render: ({ git, widget }) => git.isRepo ? renderRemoteValue(git.origin, git.origin?.owner, widget, "no remote") : gitNoGit(widget)
  },
  gitOriginRepo: {
    description: "Origin remote repository name",
    render: ({ git, widget }) => git.isRepo ? renderRemoteValue(git.origin, git.origin?.repo, widget, "no remote") : gitNoGit(widget)
  },
  gitOriginOwnerRepo: {
    description: "Origin owner/repository",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget);
      const text = metadataFlag(widget, "ownerOnlyWhenFork") && git.isFork ? git.origin?.owner : git.origin?.ownerRepo;
      return renderRemoteValue(git.origin, text, widget, "no remote");
    }
  },
  gitUpstream: {
    description: "Configured upstream branch",
    render: ({ git, widget }) => git.isRepo ? git.upstream || "" : gitNoGit(widget)
  },
  gitUpstreamOwner: {
    description: "Upstream remote owner",
    render: ({ git, widget }) => git.isRepo ? renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.owner, widget, "no upstream") : gitNoGit(widget)
  },
  gitUpstreamRepo: {
    description: "Upstream remote repository name",
    render: ({ git, widget }) => git.isRepo ? renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.repo, widget, "no upstream") : gitNoGit(widget)
  },
  gitUpstreamOwnerRepo: {
    description: "Upstream owner/repository",
    render: ({ git, widget }) => git.isRepo ? renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.ownerRepo, widget, "no upstream") : gitNoGit(widget)
  },
  gitIsFork: {
    description: "Whether origin differs from upstream remote",
    render: ({ git, widget }) => {
      const isFork = Boolean(git.isRepo && git.upstreamRemote?.ownerRepo && git.isFork);
      if (!isFork && metadataFlag(widget, "hideWhenNotFork")) return "";
      return widget.rawValue || widget.label !== undefined ? String(isFork) : `isFork: ${isFork}`;
    }
  },
  gitWorktreeMode: {
    description: "Whether the repository is a linked worktree",
    render: ({ git, state, widget }) => {
      const linked = Boolean(state.worktree || git.isRepo && git.worktree?.linked);
      if (widget.rawValue || widget.label === "") return String(linked);
      return linked ? "\u2387" : "";
    }
  },
  gitWorktree: {
    description: "Current Git worktree name when in a linked worktree",
    render: ({ git, widget }) => formatGitWorktree(git, widget)
  },
  gitWorktreeName: {
    description: "Current worktree directory name",
    render: ({ git, state }) => state.worktree?.name || git.worktree?.name || ""
  },
  gitWorktreeBranch: {
    description: "Current worktree branch name",
    render: ({ git, state }) => state.worktree?.branch || git.worktree?.branch || ""
  },
  gitWorktreeOriginalBranch: {
    description: "Upstream branch name associated with the current worktree",
    render: ({ git, state }) => state.worktree?.originalBranch || state.worktree?.original_branch || git.worktree?.originalBranch || git.worktree?.original_branch || ""
  },
  tokens: {
    description: "Total session token usage from hook or transcript state",
    render: ({ state, widget }) => {
      const total = state.usage?.totalTokens;
      return hasUsageValue(total) ? formatRawOrLabeledValue(widget, "Total: ", compactNumber(total)) : "";
    }
  },
  inputTokens: {
    description: "Total input tokens",
    render: ({ state, widget }) => hasUsageValue(state.usage?.inputTokens)
      ? formatRawOrLabeledValue(widget, "In: ", compactNumber(state.usage.inputTokens))
      : ""
  },
  outputTokens: {
    description: "Total output tokens",
    render: ({ state, widget }) => hasUsageValue(state.usage?.outputTokens)
      ? formatRawOrLabeledValue(widget, "Out: ", compactNumber(state.usage.outputTokens))
      : ""
  },
  cachedTokens: {
    description: "Cached token count when present in hook state",
    render: ({ state, widget }) => hasUsageValue(state.usage?.cachedTokens)
      ? formatRawOrLabeledValue(widget, "Cached: ", compactNumber(state.usage.cachedTokens))
      : ""
  },
  cacheReadTokens: {
    description: "Cache read token count when present in hook state",
    render: ({ state }) => state.usage?.cacheReadTokens ? compactNumber(state.usage.cacheReadTokens) : ""
  },
  cacheWriteTokens: {
    description: "Cache write token count when present in hook state",
    render: ({ state }) => state.usage?.cacheWriteTokens ? compactNumber(state.usage.cacheWriteTokens) : ""
  },
  tokenSpeed: {
    description: "Token speed per second from recent hook samples or metrics",
    render: ({ state, widget }) => {
      const value = speedWidgetValue(state, widget, "total");
      return value ? formatRawOrLabeledValue(widget, "Total: ", value) : "";
    }
  },
  totalSpeed: {
    description: "Total token speed per second from recent hook samples or metrics",
    render: ({ state, widget }) => {
      const value = speedWidgetValue(state, widget, "total");
      return value ? formatRawOrLabeledValue(widget, "Total: ", value) : "";
    }
  },
  inputSpeed: {
    description: "Input token speed per second from recent hook samples or metrics",
    render: ({ state, widget }) => {
      const value = speedWidgetValue(state, widget, "input");
      return value ? formatRawOrLabeledValue(widget, "In: ", value) : "";
    }
  },
  outputSpeed: {
    description: "Output token speed per second from recent hook samples or metrics",
    render: ({ state, widget }) => {
      const value = speedWidgetValue(state, widget, "output");
      return value ? formatRawOrLabeledValue(widget, "Out: ", value) : "";
    }
  },
  contextWindow: {
    description: "Context window size, using state or model-name inference",
    render: ({ state, codexConfig, widget }) => {
      const usage = state.usage || {};
      const inferred = inferContextWindow(state.model || codexConfig.model || "");
      const value = usage.contextWindow || inferred || DEFAULT_CONTEXT_WINDOW;
      return value ? formatRawOrLabeledValue(widget, "Win: ", compactNumber(value)) : "";
    }
  },
  contextPercent: {
    description: "Context window used percentage",
    render: ({ state, codexConfig, widget }) => renderContextPercent(state.usage || {}, widget, state.model || codexConfig.model)
  },
  contextPercentage: {
    description: "Context window used percentage",
    render: ({ state, codexConfig, widget }) => renderContextPercent(state.usage || {}, widget, state.model || codexConfig.model)
  },
  contextPercentageUsable: {
    description: "Context window usable percentage when available, otherwise context percentage",
    render: ({ state, codexConfig, widget }) => renderContextUsablePercent(state.usage || {}, widget, state.model || codexConfig.model)
  },
  contextBar: {
    description: "Context usage bar",
    render: ({ state, codexConfig, widget }) => {
      const { used, window, remaining } = contextNumbers(state.usage || {}, state.model || codexConfig.model);
      if (!used || !window) return "";
      const value = widget.mode === "remaining" ? remaining : used;
      const percent = (value / window) * 100;
      const detailedMode = contextBarDetailedMode(widget);
      if (detailedMode) return renderContextBarDisplay(percent, used, window, widget, detailedMode);
      const width = Number(widget.width || 10);
      if (usageDisplayMode(widget)) return renderPercentDisplay(percent, widget);
      return renderBar(percent / 100, width, widget.style);
    }
  },
  contextTokens: {
    description: "Context usage as used/total tokens",
    render: ({ state, codexConfig }) => {
      const { used, window } = contextNumbers(state.usage || {}, state.model || codexConfig.model);
      if (!used || !window) return "";
      return `${compactNumber(used)}/${compactNumber(window)}`;
    }
  },
  contextUsed: {
    description: "Context tokens used",
    render: ({ state, widget }) => {
      const { used } = contextNumbers(state.usage || {});
      return used ? formatRawOrLabeledValue(widget, "Ctx: ", compactNumber(used)) : "";
    }
  },
  contextLength: {
    description: "Context tokens used",
    render: ({ state, widget }) => {
      const { used } = contextNumbers(state.usage || {});
      return used ? formatRawOrLabeledValue(widget, "Ctx: ", compactNumber(used)) : "";
    }
  },
  contextRemaining: {
    description: "Context remaining percentage",
    render: ({ state, codexConfig }) => {
      const { remaining, window } = contextNumbers(state.usage || {}, state.model || codexConfig.model);
      if (!remaining || !window) return "";
      return `${Math.round((remaining / window) * 100)}%`;
    }
  },
  contextRemainingTokens: {
    description: "Context tokens remaining",
    render: ({ state, codexConfig }) => {
      const { remaining } = contextNumbers(state.usage || {}, state.model || codexConfig.model);
      return remaining ? compactNumber(remaining) : "";
    }
  },
  cost: {
    description: "Session cost in USD when present in hook state",
    render: ({ state, widget }) => {
      const cost = state.usage?.costUsd;
      return Number.isFinite(Number(cost)) ? formatRawOrLabeledValue(widget, "Cost: ", `$${Number(cost).toFixed(2)}`) : "";
    }
  },
  usageRemaining: {
    description: "Primary usage limit remaining when present in hook state",
    render: ({ state }) => state.usage?.usageLimitRemaining ? compactNumber(state.usage.usageLimitRemaining) : ""
  },
  usageUtilization: {
    description: "Primary usage limit utilization when present in hook state",
    render: ({ state }) => {
      const used = Number(state.usage?.usageLimitUsed || 0);
      const remaining = Number(state.usage?.usageLimitRemaining || 0);
      if (!used || !remaining) return "";
      return `${Math.round((used / (used + remaining)) * 100)}%`;
    }
  },
  sessionUsage: {
    description: "Primary session usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "sessionUsagePercent",
      used: "usageLimitUsed",
      remaining: "usageLimitRemaining"
    }, "Session: ")
  },
  weeklyUsage: {
    description: "Weekly usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklyUsagePercent",
      used: "weeklyUsageUsed",
      remaining: "weeklyUsageRemaining"
    }, "Weekly: ")
  },
  weeklySonnetUsage: {
    description: "Weekly Sonnet usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklySonnetUsagePercent",
      used: "weeklySonnetUsageUsed",
      remaining: "weeklySonnetUsageRemaining"
    }, "Weekly Sonnet: ")
  },
  weeklyOpusUsage: {
    description: "Weekly Opus usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklyOpusUsagePercent",
      used: "weeklyOpusUsageUsed",
      remaining: "weeklyOpusUsageRemaining"
    }, "Weekly Opus: ")
  },
  extraUsageRemaining: {
    description: "Extra usage remaining when present in hook state",
    render: ({ state, widget }) => {
      const usage = state.usage || {};
      if (usage.extraUsageEnabled === false) return extraUsageDisabled(widget, "Overage Left: ");
      const remaining = extraUsageRemainingDollars(usage);
      if (Number.isFinite(remaining)) return formatRawOrLabeledValue(widget, "Overage Left: ", formatUsd(remaining));
      return usage.error ? usageErrorMessage(usage.error) : "";
    }
  },
  extraUsageUtilization: {
    description: "Extra usage utilization when present in hook state",
    render: ({ state, widget }) => {
      const usage = state.usage || {};
      if (usage.extraUsageEnabled === false) return extraUsageDisabled(widget, "Overage: ");
      const percent = extraUsagePercent(usage);
      if (!Number.isFinite(percent)) return usage.error ? usageErrorMessage(usage.error) : "";
      return formatRawOrLabeledValue(widget, "Overage: ", renderUsagePercentValue(percent, widget));
    }
  },
  duration: {
    description: "Elapsed time since SessionStart hook",
    render: ({ state }) => state.startedAt ? formatDuration(Date.now() - Date.parse(state.startedAt)) : ""
  },
  blockTimer: {
    description: "Elapsed time within the current five-hour usage block",
    render: ({ state, widget }) => formatBlockTimer(state.startedAt ? blockProgress(Date.parse(state.startedAt)) : null, widget)
  },
  blockRemaining: {
    description: "Remaining time in the current five-hour usage block",
    render: ({ state }) => state.startedAt ? formatDuration(blockProgress(Date.parse(state.startedAt)).remaining) : ""
  },
  blockResetTimer: {
    description: "Remaining time or reset timestamp for the current five-hour usage block",
    render: ({ state, widget }) => renderResetTimerWidget("Reset", resolveBlockProgress(state), widget, { error: state.usage?.error })
  },
  blockBar: {
    description: "Progress bar for the current five-hour usage block",
    render: ({ state, widget }) => {
      if (!state.startedAt) return "";
      const progress = blockProgress(Date.parse(state.startedAt));
      return renderBar(progress.ratio, Number(widget.width || 16), widget.style);
    }
  },
  weeklyTimer: {
    description: "Elapsed time within the current local calendar week",
    render: () => formatDuration(weekProgress().elapsed)
  },
  weeklyRemaining: {
    description: "Remaining time in the current local calendar week",
    render: () => formatDuration(weekProgress().remaining)
  },
  weeklyResetTimer: {
    description: "Remaining time or reset timestamp for the current local calendar week",
    render: ({ state, widget }) => renderResetTimerWidget("Weekly Reset", resolveWeeklyProgress(state), widget, {
      error: state.usage?.error,
      useDays: !metadataFlag(widget, "hours")
    })
  },
  weeklyBar: {
    description: "Progress bar for the current local calendar week",
    render: ({ widget }) => renderBar(weekProgress().ratio, Number(widget.width || 16), widget.style)
  },
  runState: {
    description: "Current best-effort run state",
    render: ({ state }) => state.runState || "Ready"
  },
  lastEvent: {
    description: "Last Codex hook event received",
    render: ({ state }) => state.lastEvent || ""
  },
  lastTool: {
    description: "Last tool observed by Codex hooks",
    render: ({ state }) => state.lastTool || ""
  },
  session: {
    description: "Current Codex session id",
    render: ({ state }) => state.sessionId ? String(state.sessionId).slice(0, 8) : ""
  },
  codexSessionId: {
    description: "Current Codex session id",
    render: ({ state }) => state.sessionId ? String(state.sessionId).slice(0, 8) : ""
  },
  claudeSessionId: {
    description: "Claude-compatible alias for the current Codex session id",
    render: ({ state, widget }) => state.sessionId ? formatRawOrLabeledValue(widget, "Session ID: ", String(state.sessionId)) : ""
  },
  sessionName: {
    description: "Current session name or thread title when present in hook state",
    render: ({ state, widget }) => {
      const value = state.sessionName || transcriptSessionName(state.transcriptPath);
      return value ? formatRawOrLabeledValue(widget, "Session: ", value) : "";
    }
  },
  sessionClock: {
    description: "Elapsed time since SessionStart hook",
    render: ({ state, widget }) => {
      const durationMs = Number(state.usage?.totalDurationMs);
      const value = Number.isFinite(durationMs) && durationMs >= 0
        ? formatSessionDuration(durationMs)
        : state.startedAt
          ? formatSessionDuration(Date.now() - Date.parse(state.startedAt))
          : "";
      return value ? formatRawOrLabeledValue(widget, "Session: ", value) : "";
    }
  },
  version: {
    description: "cxstatusline version or Codex version when present in hook state",
    render: ({ state, widget }) => {
      const version = widget.source === "codex" ? state.version : state.version || PACKAGE.version;
      const value = String(version || "").replace(/^v/, "");
      return value ? formatRawOrLabeledValue(widget, "v", value) : "";
    }
  },
  outputStyle: {
    description: "Current output style when present in hook state or config",
    render: ({ state, codexConfig, widget }) => {
      const value = state.outputStyle || codexConfig.output_style?.name || codexConfig.outputStyle?.name || codexConfig.output_style || codexConfig.outputStyle || "";
      return value ? formatRawOrLabeledValue(widget, "Style: ", value) : "";
    }
  },
  vimMode: {
    description: "Current editor vim mode when present in hook state",
    render: ({ state, widget }) => state.vimMode ? formatVimMode(state.vimMode, widget) : ""
  },
  voiceStatus: {
    description: "Voice input status when present in hook state",
    render: ({ state, cwd, widget }) => formatStatusValue(resolveVoiceStatus(state, cwd), "voice", widget, {
      icon: VOICE_ICON,
      nerdOn: VOICE_NERD_FONT_ON,
      nerdOff: VOICE_NERD_FONT_OFF,
      defaultFormat: "icon",
      formats: ["icon", "icon-text", "text", "word"]
    })
  },
  remoteControlStatus: {
    description: "Remote control status when present in hook state",
    render: ({ state, widget }) => formatStatusValue(state.remoteControlStatus, "remote", widget, {
      icon: REMOTE_ICON,
      nerdOn: REMOTE_NERD_FONT_ON,
      nerdOff: REMOTE_NERD_FONT_OFF,
      defaultFormat: "word",
      formats: ["word", "icon", "icon-text", "text", "label-check", "label-mark"],
      checkFormats: true
    })
  },
  skills: {
    description: "Skill invocation metrics when present in hook state",
    render: ({ state, widget }) => formatSkills(state.skills || {}, widget)
  },
  accountEmail: {
    description: "Account email when present in hook state or environment",
    render: ({ state }) => accountEmailValue(state)
  },
  claudeAccountEmail: {
    description: "Claude-compatible alias for account email when present",
    render: ({ state, widget }) => {
      const value = accountEmailValue(state);
      return value ? formatRawOrLabeledValue(widget, "Account: ", value) : "";
    }
  },
  compactions: {
    description: "Count of observed context compactions",
    render: ({ state, widget }) => formatCompactions(state.compactions, widget)
  },
  memory: {
    description: "System memory utilization",
    render: ({ widget }) => formatRawOrLabeledValue(widget, "Mem: ", memoryUsage())
  },
  terminalWidth: {
    description: "Detected terminal width",
    render: ({ widget, terminalWidth }) => {
      const width = terminalWidth || process.env.CXSTATUSLINE_WIDTH || process.env.CCSTATUSLINE_WIDTH || process.env.COLUMNS || process.stdout.columns || "";
      return width ? formatRawOrLabeledValue(widget, "Term: ", width) : "";
    }
  },
  text: {
    description: "Custom literal text",
    render: ({ widget }) => widget.customText || widget.text || ""
  },
  symbol: {
    description: "Custom symbol or short text",
    render: ({ widget }) => widget.customSymbol || widget.symbol || widget.text || ""
  },
  command: {
    description: "Custom command output",
    render: ({ widget, cwd, state, git, codexConfig, config }) => {
      const command = widget.command || widget.commandPath;
      if (!command) return "";
      const result = run("sh", ["-c", command], {
        cwd,
        timeout: Number(widget.timeout || 1000),
        input: commandStdin({ cwd, state, git, codexConfig, config })
      });
      return result.ok ? result.stdout.trim().split(/\r?\n/)[0] : "";
    }
  },
  separator: {
    description: "Manual separator text",
    render: ({ widget }) => widget.text || widget.separator || "|"
  },
  spacer: {
    description: "Flexible spacer for right-aligned plain output",
    render: () => SPACER
  },
  link: {
    description: "OSC8 clickable link",
    render: ({ widget }) => {
      const url = linkUrl(widget);
      const text = linkText(widget, url);
      const displayText = widget.rawValue ? text : `\u{1F517} ${text}`;
      if (!isHttpUrl(url)) return displayText;
      return osc8(url, displayText) || displayText;
    }
  },
  gitBranchLink: {
    description: "Clickable GitHub/GitLab branch link when origin is known",
    render: ({ git, widget }) => {
      if (!git.isRepo) return gitNoGit(widget, "no git");
      if (!git.branch || git.branch === "(detached)") return "";
      return osc8(branchWebUrl(git.origin, git.branch), git.branch);
    }
  },
  gitPullRequest: {
    description: "Current GitHub pull request or GitLab merge request when gh/glab is available",
    render: ({ git, cwd, widget }) => {
      if (!git.isRepo) return gitNoGit(widget, `(no ${pullRequestNoun(null, git)})`);
      const item = getPullRequestInfo(cwd || git.root);
      if (!item) return gitNoGit(widget, `(no ${pullRequestNoun(null, git)})`);
      return formatPullRequestInfo(item, widget);
    }
  },
  gitPullRequestState: {
    description: "Current pull request or merge request state",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      return getPullRequestInfo(cwd || git.root)?.state || "";
    }
  },
  gitPullRequestReview: {
    description: "Current GitHub pull request review decision",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      return getPullRequestInfo(cwd || git.root)?.reviewDecision || "";
    }
  },
  gitPullRequestStats: {
    description: "Current pull request or merge request file/addition/deletion stats",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      const item = getPullRequestInfo(cwd || git.root);
      if (!item) return "";
      const parts = [];
      if (item.changedFiles) parts.push(`${item.changedFiles} files`);
      if (item.additions) parts.push(`+${item.additions}`);
      if (item.deletions) parts.push(`-${item.deletions}`);
      return parts.join(" ");
    }
  },
  gitPullRequestBranches: {
    description: "Current pull request or merge request head and base branches",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      const item = getPullRequestInfo(cwd || git.root);
      if (!item?.headRefName || !item?.baseRefName) return "";
      return `${item.headRefName} -> ${item.baseRefName}`;
    }
  },
  jjWorkspace: {
    description: "Current Jujutsu workspace name",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["workspace", "list", "--template", "if(target.current_working_copy(), name ++ \"\\n\")"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget, `${JJ_WORKSPACE_ICON} no jj`);
      const workspace = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
      return workspace ? jjIconValue(widget, workspace, JJ_WORKSPACE_ICON) : jjNoJj(widget, `${JJ_WORKSPACE_ICON} no jj`);
    }
  },
  jjRevision: {
    description: "Current Jujutsu revision id",
    render: ({ cwd, widget }) => {
      const revision = jj(["log", "-r", "@", "--no-graph", "-T", "change_id.shortest()"], cwd);
      return revision ? jjIconValue(widget, revision, JJ_REVISION_ICON) : jjNoJj(widget, `${JJ_REVISION_ICON} no jj`);
    }
  },
  jjDescription: {
    description: "Current Jujutsu change description",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["log", "-r", "@", "--no-graph", "-T", "description.first_line()"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget, "no jj");
      return output.trim() || "(no description)";
    }
  },
  jjBookmarks: {
    description: "Current Jujutsu bookmarks",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["log", "--no-graph", "-r", "heads(::@ & bookmarks())", "--template", "bookmarks"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget, `${JJ_BOOKMARK_ICON} no jj`);
      const bookmarks = parseJjBookmarks(output).join(", ");
      return bookmarks ? jjIconValue(widget, bookmarks, JJ_BOOKMARK_ICON) : jjNoJj(widget, `${JJ_BOOKMARK_ICON} (none)`);
    }
  },
  jjRootDir: {
    description: "Current Jujutsu root directory name",
    render: ({ cwd, widget }) => {
      const root = jj(["root"], cwd);
      return root ? basename(root) : jjNoJj(widget, "no jj");
    }
  },
  jjChanges: {
    description: "Current Jujutsu insertion/deletion summary",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      return formatJjChangeSummary(parseJjStat(output));
    }
  },
  jjChangedFiles: {
    description: "Current Jujutsu changed file count",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      return String(parseJjStat(output).files);
    }
  },
  jjStats: {
    description: "Current Jujutsu file, insertion, and deletion stats",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      const stat = parseJjStat(output);
      return `${stat.files} files +${stat.insertions} -${stat.deletions}`;
    }
  },
  jjBookmarkCount: {
    description: "Current Jujutsu bookmark count",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["log", "--no-graph", "-r", "heads(::@ & bookmarks())", "--template", "bookmarks"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      const bookmarks = parseJjBookmarks(output);
      return bookmarks.length ? String(bookmarks.length) : "";
    }
  },
  jjInsertions: {
    description: "Current Jujutsu insertion count",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      const stat = parseJjStat(output);
      return `+${stat.insertions}`;
    }
  },
  jjDeletions: {
    description: "Current Jujutsu deletion count",
    render: ({ cwd, widget }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return jjNoJj(widget);
      const stat = parseJjStat(output);
      return `-${stat.deletions}`;
    }
  }
};

export function listWidgets() {
  return Object.entries(widgetRegistry).map(([name, widget]) => ({ name, description: widget.description }));
}

export function renderWidget(widget, context) {
  const type = typeof widget === "string" ? widget : widget.type;
  const resolvedType = resolveWidgetType(type);
  const definition = widgetRegistry[resolvedType];
  if (!definition) return "";
  const value = definition.render({ ...context, widget: typeof widget === "string" ? { type } : widget });
  if (!value) return "";
  if (value === SPACER) return SPACER;

  const label = typeof widget === "string" ? "" : widget.label;
  if (context.config.minimal || label === "") return String(value);
  return label ? `${label}: ${value}` : String(value);
}

export function resolveWidgetType(type) {
  const raw = String(type || "");
  if (widgetRegistry[raw]) return raw;

  const directAlias = WIDGET_ALIASES[raw];
  if (directAlias && widgetRegistry[directAlias]) return directAlias;

  const normalized = normalizeWidgetType(raw);
  const normalizedAlias = Object.entries(WIDGET_ALIASES)
    .find(([alias]) => normalizeWidgetType(alias) === normalized)?.[1];
  if (normalizedAlias && widgetRegistry[normalizedAlias]) return normalizedAlias;

  return Object.keys(widgetRegistry).find((name) => normalizeWidgetType(name) === normalized) || null;
}

function normalizeWidgetType(type) {
  return String(type || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function formatPath(path, options = {}) {
  let output = String(path || "");
  const abbreviateHome = options.home !== false && metadataFlag(options, "abbreviateHome") !== false;
  if (abbreviateHome) {
    const home = os.homedir();
    if (output === home) output = "~";
    else if (output.startsWith(`${home}/`)) output = `~/${output.slice(home.length + 1)}`;
  }

  const segments = Number(metadataValue(options, "segments") || 0);
  if (segments > 0) {
    const prefix = output.startsWith("~/") ? "~/" : output.startsWith("/") ? "/" : "";
    const parts = output.replace(/^~?\//, "").split("/").filter(Boolean);
    if (parts.length > segments) output = `${prefix}.../${parts.slice(-segments).join("/")}`;
  }

  if (options.fish || metadataFlag(options, "fishStyle") === true) output = fishPath(output);
  return output;
}

export function inferContextWindow(model) {
  const text = String(model || "").toLowerCase();
  const match = text.match(/(\d+(?:[,_]\d+)*(?:\.\d+)?)\s*([mk])(?:\s*(?:token\s*)?context)?/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1].replace(/[,_]/g, ""));
  const unit = match[2];
  return Math.round(value * (unit === "m" ? 1_000_000 : 1_000));
}

function speedWidgetValue(state = {}, widget = {}, kind = "total") {
  const metrics = speedMetricsForWidget(state, widget);
  if (metrics) return formatSpeedValue(calculateMetricSpeed(metrics, kind));

  const key = kind === "input" ? "inputTokens" : kind === "output" ? "outputTokens" : "totalTokens";
  const speed = tokenSpeed(state.samples || [], speedWindowSeconds(widget), key);
  return speed ? formatSpeedValue(speed) : "";
}

function speedMetricsForWidget(state = {}, widget = {}) {
  const windowSeconds = speedWindowSeconds(widget);
  if (windowSeconds > 0) {
    const windowed = state.windowedSpeedMetrics || state.usage?.windowedSpeedMetrics;
    const metrics = windowed?.[String(windowSeconds)] || windowed?.[windowSeconds];
    return metrics || null;
  }
  if (state.speedMetrics) return state.speedMetrics;
  const usage = state.usage || {};
  if (hasUsageValue(usage.totalDurationMs)) {
    return {
      totalDurationMs: usage.totalDurationMs,
      inputTokens: Number(usage.inputTokens || 0),
      outputTokens: Number(usage.outputTokens || 0),
      totalTokens: Number(usage.totalTokens || 0)
    };
  }
  return null;
}

function speedWindowSeconds(widget = {}) {
  const value = metadataValue(widget, "windowSeconds") ?? widget.windowSeconds ?? 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(120, Math.trunc(parsed)));
}

function calculateMetricSpeed(metrics = {}, kind = "total") {
  const durationMs = Number(metrics.totalDurationMs || 0);
  if (durationMs === 0) return null;
  const tokens = kind === "input"
    ? Number(metrics.inputTokens || 0)
    : kind === "output"
      ? Number(metrics.outputTokens || 0)
      : Number(metrics.totalTokens || 0);
  return tokens / (durationMs / 1000);
}

function tokenSpeed(samples, windowSeconds, key = "totalTokens") {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  const oldest = windowSeconds <= 0
    ? samples[0]
    : [...samples].reverse().find((sample) => Date.parse(sample.at) <= Date.parse(newest.at) - windowSeconds * 1000) || samples[0];
  const deltaTokens = Number(newest[key] || 0) - Number(oldest[key] || 0);
  const deltaSeconds = (Date.parse(newest.at) - Date.parse(oldest.at)) / 1000;
  if (deltaTokens <= 0 || deltaSeconds <= 0) return 0;
  return deltaTokens / deltaSeconds;
}

function formatSpeedValue(speed) {
  if (speed === null) return "\u2014";
  const number = Number(speed || 0);
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k t/s`;
  return `${number.toFixed(1)} t/s`;
}

function jj(args, cwd) {
  const output = jjOutput(args, cwd);
  return output ? output.split(/\r?\n/)[0] : "";
}

function jjOutput(args, cwd, options = {}) {
  const result = run("jj", args, { cwd, timeout: 1000 });
  if (!result.ok) return null;
  const output = result.stdout.trimEnd();
  return output || options.allowEmpty ? output : null;
}

function jjNoJj(widget, text = "(no jj)") {
  return metadataFlag(widget, "hideNoJj") === true ? "" : text;
}

function jjIconValue(widget, value, icon) {
  return widget?.rawValue || widget?.label !== undefined ? value : `${icon} ${value}`;
}

export function parseJjStat(output) {
  const text = String(output || "");
  const files = text.match(/(\d+) files? changed/);
  const insertions = text.match(/(\d+) insertions?\(\+\)/) || text.match(/(\d+)\s+\+/);
  const deletions = text.match(/(\d+) deletions?\(-\)/) || text.match(/(\d+)\s+-/);
  return {
    files: files ? Number(files[1]) : 0,
    insertions: insertions ? Number(insertions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0
  };
}

export function parseJjBookmarks(output) {
  return String(output || "")
    .split(/\s+/)
    .map((bookmark) => bookmark.trim())
    .filter(Boolean);
}

export function formatJjChangeSummary(stat) {
  return `(+${Number(stat?.insertions || 0)},-${Number(stat?.deletions || 0)})`;
}

function contextNumbers(usage, model) {
  const used = Number(usage.contextUsed || 0);
  const inferred = inferContextWindow(model);
  const window = Number(usage.contextWindow || (usage.contextRemaining && usage.contextUsed ? usage.contextRemaining + usage.contextUsed : 0) || (used ? inferred || DEFAULT_CONTEXT_WINDOW : 0));
  const remaining = Number(usage.contextRemaining || (window && used ? window - used : 0));
  return { used, window, remaining };
}

function renderContextPercent(usage, widget, model) {
  const { used, window, remaining } = contextNumbers(usage, model);
  const explicitPercent = Number(usage.contextUsagePercent);
  if ((!used && !Number.isFinite(explicitPercent)) || !window) return "";
  const inverse = contextInverse(widget);
  const value = inverse ? remaining : used;
  const percent = Number.isFinite(explicitPercent) ? (inverse ? 100 - explicitPercent : explicitPercent) : (value / window) * 100;
  const label = inverse ? "Ctx Left: " : "Ctx Used: ";
  return formatRawOrLabeledValue(widget, label, renderContextPercentValue(percent, widget));
}

function renderContextUsablePercent(usage, widget, model) {
  const { used, window } = contextNumbers(usage, model);
  const usableWindow = window * 0.8;
  if (!used || !usableWindow) return "";
  const usedPercent = Math.min(100, (used / usableWindow) * 100);
  const inverse = contextInverse(widget);
  const percent = inverse ? 100 - usedPercent : usedPercent;
  const label = inverse ? "Ctx(u) Left: " : "Ctx(u) Used: ";
  return formatRawOrLabeledValue(widget, label, renderContextPercentValue(percent, widget));
}

function contextInverse(widget = {}) {
  return widget.mode === "remaining" || metadataFlag(widget, "inverse") === true;
}

function renderContextPercentValue(percent, widget = {}) {
  if (usageDisplayMode(widget) || ["bar", "progress"].includes(widget.mode) || widget.style === "bar" || widget.display === "bar") {
    return renderPercentDisplay(percent, widget);
  }
  const clamped = clampPercent(percent);
  const displayPercent = metadataFlag(widget, "invert") === true ? 100 - clamped : clamped;
  return formatPercent(displayPercent, 1);
}

function renderUsagePercent(usage, widget, keys, label = "") {
  const percent = usagePercent(usage, keys);
  if (!Number.isFinite(percent)) return usage.error ? usageErrorMessage(usage.error) : "";
  const display = widget.mode === "remaining" ? 100 - percent : percent;
  return formatRawOrLabeledValue(widget, label, renderUsagePercentValue(display, widget));
}

function renderUsagePercentValue(percent, widget = {}) {
  if (usageDisplayMode(widget) || ["bar", "progress"].includes(widget.mode) || widget.style === "bar" || widget.display === "bar") {
    return renderPercentDisplay(percent, widget);
  }
  const clamped = clampPercent(percent);
  const displayPercent = metadataFlag(widget, "invert") === true ? 100 - clamped : clamped;
  return formatPercent(displayPercent, 1);
}

function renderPercentDisplay(percent, widget = {}) {
  const clamped = clampPercent(percent);
  const displayPercent = metadataFlag(widget, "invert") === true ? 100 - clamped : clamped;
  const display = usageDisplayMode(widget);
  const cursor = usageCursorPercent(widget, displayPercent);

  if (display === "progress" || display === "progress-short") {
    const width = Number(widget.width || (display === "progress" ? 32 : 16));
    return renderProgressBar(displayPercent, width, widget.style || widget.barStyle, {
      cursor,
      decimals: 1
    });
  }

  if (display === "slider" || display === "slider-only") {
    const slider = renderSlider(displayPercent, Number(widget.width || 10), cursor);
    return display === "slider-only" ? slider : `${slider} ${formatPercent(displayPercent, 1)}`;
  }

  if (widget.mode === "bar" || widget.mode === "progress" || widget.style === "bar" || widget.display === "bar") {
    return renderBar(displayPercent / 100, Number(widget.width || 16), widget.barStyle || widget.style);
  }

  return `${Math.round(displayPercent)}%`;
}

function renderContextBarDisplay(percent, used, total, widget = {}, display = contextBarDetailedMode(widget)) {
  const clamped = clampPercent(percent);
  const displayPercent = metadataFlag(widget, "invert") === true ? 100 - clamped : clamped;
  const raw = widget.rawValue || widget.label !== undefined;
  const detail = `${contextK(used)}/${contextK(total)} (${Math.round(displayPercent)}%)`;
  let output = "";

  if (display === "slider" || display === "slider-only") {
    const slider = renderSlider(displayPercent, Number(widget.width || 10), usageCursorPercent(widget, displayPercent));
    output = display === "slider-only" ? slider : `${slider} ${detail}`;
  } else {
    const width = Number(widget.width || (display === "progress" ? 32 : 16));
    const bar = renderProgressBar(displayPercent, width, widget.style || widget.barStyle, {
      cursor: usageCursorPercent(widget, displayPercent),
      showPercent: false
    });
    output = `${bar} ${detail}`;
  }

  return raw ? output : `Context: ${output}`;
}

function contextBarDetailedMode(widget = {}) {
  const value = metadataValue(widget, "display");
  const configured = value !== undefined ? value : "progress-short";
  const mode = String(configured || "").trim();
  if (["progress", "progress-short", "slider", "slider-only"].includes(mode)) return mode;
  return "progress-short";
}

function contextK(value) {
  return `${Math.round(Number(value || 0) / 1000)}k`;
}

function usageDisplayMode(widget = {}) {
  const mode = String(metadataValue(widget, "display") || widget.display || "").trim();
  return ["progress", "progress-short", "slider", "slider-only"].includes(mode) ? mode : "";
}

function usageCursorPercent(widget, fallback) {
  const value = metadataValue(widget, "cursor");
  const flag = metadataFlag(widget, "cursor");
  if (typeof value === "number" && Number.isFinite(value)) return clampPercent(value);
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return clampPercent(Number(value));
  if (flag === false) return null;
  return flag === true ? clampPercent(fallback) : null;
}

function usagePercent(usage, keys) {
  if (Object.prototype.hasOwnProperty.call(usage, keys.percent)) {
    const direct = Number(usage[keys.percent]);
    if (Number.isFinite(direct) && direct >= 0) return direct <= 1 ? direct * 100 : direct;
  }

  const used = Number(usage[keys.used] || 0);
  const remaining = Number(usage[keys.remaining] || 0);
  if (used || remaining) return (used / (used + remaining)) * 100;
  return Number.NaN;
}

function extraUsagePercent(usage) {
  if (hasUsageValue(usage.extraUsageUtilization)) {
    const direct = Number(usage.extraUsageUtilization);
    return direct <= 1 ? direct * 100 : direct;
  }
  if (hasUsageValue(usage.extraUsageUtilizationPercent)) {
    const direct = Number(usage.extraUsageUtilizationPercent);
    return direct <= 1 ? direct * 100 : direct;
  }
  return usagePercent(usage, {
    percent: "extraUsagePercent",
    used: "extraUsageUsed",
    remaining: "extraUsageRemaining"
  });
}

function extraUsageRemainingDollars(usage = {}) {
  if (hasUsageValue(usage.extraUsageLimit) && hasUsageValue(usage.extraUsageUsed)) {
    return Math.max(0, Number(usage.extraUsageLimit) / 100 - Number(usage.extraUsageUsed));
  }
  if (hasUsageValue(usage.extraUsageRemaining)) return Number(usage.extraUsageRemaining);
  return Number.NaN;
}

function formatUsd(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hasUsageValue(value) {
  return value !== undefined && value !== null && Number.isFinite(Number(value));
}

function extraUsageDisabled(widget, label = "") {
  return metadataFlag(widget, "hideIfDisabled") === true ? "" : formatRawOrLabeledValue(widget, label, "n/a");
}

function usageErrorMessage(error) {
  const normalized = String(error || "").trim().toLowerCase();
  if (normalized === "no-credentials") return "[No credentials]";
  if (normalized === "timeout") return "[Timeout]";
  if (normalized === "rate-limited") return "[Rate limited]";
  if (normalized === "api-error") return "[API Error]";
  if (normalized === "parse-error") return "[Parse Error]";
  return `[${String(error || "Usage error")}]`;
}

function formatStatusValue(value, label, widget = {}, options = {}) {
  const state = statusState(value);
  if (!state) return typeof value === "string" && value.trim() ? `${label} ${value.trim()}` : "";
  if (widget.rawValue || widget.label === "") return state.text;
  const format = statusFormat(widget, options.defaultFormat || "word", options.formats);
  const nerdFont = widgetFlag(widget, "nerdFont");
  const icon = nerdFont ? (state.enabled ? options.nerdOn : options.nerdOff) : options.icon;
  if (format === "icon") return nerdFont ? icon : `${icon} ${state.enabled ? STATUS_DOT_ON : STATUS_DOT_OFF}`;
  if (format === "icon-text") return `${icon} ${state.text}`;
  if (format === "text") return state.text;
  if (options.checkFormats && format === "label-check") return `${label} ${state.enabled ? "\u2705" : "\u274C"}`;
  if (options.checkFormats && format === "label-mark") return `${label} ${state.enabled ? "\u2713" : "\u2717"}`;
  return `${label} ${state.text}`;
}

function statusFormat(widget, fallback, formats) {
  const format = widgetFormat(widget, fallback);
  return Array.isArray(formats) && formats.length && !formats.includes(format) ? fallback : format;
}

function formatRawOrLabeledValue(widget, prefix, value) {
  return widget?.rawValue || widget?.label !== undefined ? String(value) : `${prefix}${value}`;
}

function formatModelName(value) {
  const name = typeof value === "string"
    ? value
    : value?.display_name || value?.displayName || value?.id || "";
  return String(name || "").replace(/\s*\(.*\)$/, "");
}

function resolveThinkingEffort(state = {}, codexConfig = {}) {
  const statusValue = firstNonEmptyString(
    state.reasoningEffort,
    state.effort?.level,
    state.effortLevel,
    state.reasoning_effort,
    state.reasoningEffort
  );
  if (statusValue !== undefined) return normalizeThinkingEffort(statusValue) || null;

  const transcriptEffort = transcriptThinkingEffort(state.transcriptPath);
  if (transcriptEffort !== undefined) return transcriptEffort || null;

  const configured = firstNonEmptyString(
    codexConfig.model_reasoning_effort,
    codexConfig.modelReasoningEffort,
    codexConfig.reasoning_effort,
    codexConfig.reasoningEffort,
    codexConfig.effortLevel
  );
  return normalizeThinkingEffort(configured) || null;
}

function formatThinkingEffort(resolved) {
  if (!resolved) return "default";
  return resolved.known ? resolved.value : `${resolved.value}?`;
}

function normalizeThinkingEffort(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (KNOWN_THINKING_EFFORTS.has(normalized)) return { value: normalized, known: true };
  if (UNKNOWN_EFFORT_PATTERN.test(normalized)) return { value: normalized, known: false };
  return undefined;
}

function transcriptThinkingEffort(path) {
  if (!path) return undefined;
  const cached = THINKING_EFFORT_CACHE.get(path);
  if (cached && Date.now() - cached.checkedAt < 1000) return cached.value;
  if (!existsSync(path)) return cacheTranscriptThinkingEffort(path, null, undefined);
  try {
    const stat = statSync(path);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value;
    const lines = readTranscriptTail(path, stat).split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof entry?.message?.content !== "string") continue;
      const content = stripAnsi(entry.message.content).trim();
      if (content.startsWith(EFFORT_STDOUT_PREFIX)) {
        const match = EFFORT_STDOUT_REGEX.exec(content);
        return cacheTranscriptThinkingEffort(path, stat, normalizeThinkingEffort(match?.[1]));
      }
      if (!content.startsWith(MODEL_STDOUT_PREFIX)) continue;
      const match = MODEL_STDOUT_EFFORT_REGEX.exec(content);
      return cacheTranscriptThinkingEffort(path, stat, normalizeThinkingEffort(match?.[1]));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function transcriptSessionName(path) {
  if (!path || !existsSync(path)) return "";
  try {
    const stat = statSync(path);
    const lines = readTranscriptTail(path, stat).split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry?.type === "custom-title" && typeof entry.customTitle === "string" && entry.customTitle.trim()) {
          return entry.customTitle.trim();
        }
      } catch {
        // Ignore malformed transcript lines.
      }
    }
  } catch {
    return "";
  }
  return "";
}

function readTranscriptTail(path, stat) {
  const size = Number(stat?.size || 0);
  const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
  if (length <= 0) return "";
  const buffer = Buffer.allocUnsafe(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

function cacheTranscriptThinkingEffort(path, stat, value) {
  THINKING_EFFORT_CACHE.set(path, {
    checkedAt: Date.now(),
    mtimeMs: stat?.mtimeMs,
    size: stat?.size,
    value
  });
  if (THINKING_EFFORT_CACHE.size > 32) THINKING_EFFORT_CACHE.delete(THINKING_EFFORT_CACHE.keys().next().value);
  return value;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function formatSessionDuration(durationMs) {
  const totalMinutes = Math.floor(Number(durationMs || 0) / 60000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}hr`;
  return `${hours}hr ${minutes}m`;
}

function formatBlockTimer(progress, widget = {}) {
  const display = usageDisplayMode(widget);
  const percent = progress ? progress.ratio * 100 : 0;
  const displayPercent = progress && metadataFlag(widget, "invert") === true ? 100 - percent : percent;

  if (display === "progress" || display === "progress-short") {
    const width = Number(widget.width || (display === "progress" ? 32 : 16));
    return formatRawOrLabeledValue(widget, "Block ", renderProgressBar(displayPercent, width, widget.style || widget.barStyle, {
      decimals: 1
    }));
  }

  if (display === "slider" || display === "slider-only") {
    const slider = renderSlider(displayPercent, Number(widget.width || 10));
    const output = display === "slider-only" ? slider : `${slider} ${formatPercent(displayPercent, 1)}`;
    return formatRawOrLabeledValue(widget, "Block ", output);
  }

  const compact = metadataFlag(widget, "compact") === true;
  const elapsed = progress ? formatUsageDuration(progress.elapsed, compact, false) : compact ? "0m" : "0hr 0m";
  return formatRawOrLabeledValue(widget, "Block: ", elapsed);
}

function formatUsageDuration(durationMs, compact = false, useDays = true) {
  const clampedMs = Math.max(0, Number(durationMs || 0));
  const totalHours = Math.floor(clampedMs / 3600000);
  const minutes = Math.floor((clampedMs % 3600000) / 60000);
  const dayCount = useDays ? Math.floor(totalHours / 24) : 0;
  const hours = useDays ? totalHours % 24 : totalHours;
  const hourLabel = compact ? "h" : "hr";
  const separator = compact ? "" : " ";
  const parts = [
    dayCount > 0 && `${dayCount}d`,
    hours > 0 && `${hours}${hourLabel}`,
    minutes > 0 && `${minutes}m`
  ].filter(Boolean);
  return parts.length ? parts.join(separator) : "0m";
}

function renderResetTimerWidget(label, progress, widget = {}, options = {}) {
  if (!progress) {
    return options.error ? usageErrorMessage(options.error) : "";
  }
  const prefix = usageDisplayMode(widget) ? `${label} ` : `${label}: `;
  return formatRawOrLabeledValue(widget, prefix, formatResetTimer(progress, widget, {
    usageDuration: true,
    useDays: options.useDays !== false
  }));
}

function resolveBlockProgress(state = {}) {
  const usage = state.usage || {};
  if (usage.sessionResetAt) return progressFromResetAt(usage.sessionResetAt, FIVE_HOURS_MS);
  if (state.startedAt) return blockProgress(Date.parse(state.startedAt));
  if (usage.error) return null;
  return null;
}

function resolveWeeklyProgress(state = {}) {
  const usage = state.usage || {};
  if (usage.weeklyResetAt) return progressFromResetAt(usage.weeklyResetAt, WEEK_MS);
  if (usage.error) return null;
  return weekProgress();
}

function progressFromResetAt(resetAt, durationMs, nowMs = Date.now()) {
  const resetAtMs = Date.parse(resetAt);
  if (!Number.isFinite(resetAtMs)) return null;
  const startAtMs = resetAtMs - durationMs;
  const elapsed = Math.max(0, Math.min(durationMs, nowMs - startAtMs));
  const remaining = Math.max(0, durationMs - elapsed);
  return {
    elapsed,
    remaining,
    ratio: durationMs > 0 ? elapsed / durationMs : 0,
    resetAt: new Date(resetAtMs)
  };
}

function statusState(value) {
  if (value === true) return { enabled: true, text: "on" };
  if (value === false) return { enabled: false, text: "off" };
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["on", "true", "enabled", "yes", "1"].includes(text)) return { enabled: true, text: "on" };
    if (["off", "false", "disabled", "no", "0"].includes(text)) return { enabled: false, text: "off" };
  }
  return null;
}

function formatCompactions(value, widget = {}) {
  const count = Number(value || 0);
  if (count === 0 && widgetFlag(widget, "hideZero")) return "";
  const format = compactionFormat(widget);
  const icon = format === "icon-space-number" && widgetFlag(widget, "nerdFont") ? COMPACTION_NERD_FONT_ICON : COMPACTION_ICON;
  if (format === "icon-space-number") return `${icon} ${count}`;
  if (format === "text-and-number") return `Compactions: ${count}`;
  return String(count);
}

function compactionFormat(widget) {
  const format = widgetFormat(widget, "icon-space-number");
  return ["icon-space-number", "text-and-number", "number"].includes(format) ? format : "icon-space-number";
}

function widgetFormat(widget, fallback) {
  return String(metadataValue(widget, "format") || widget?.format || fallback);
}

function widgetFlag(widget, key) {
  return metadataFlag(widget, key) === true;
}

function formatVimMode(value, widget) {
  const mode = String(value || "").toUpperCase();
  if (!mode) return "";
  const format = widgetFormat(widget, "icon-dash-letter");
  if (format === "word") return mode;
  const letter = mode === "NORMAL" ? "N" : mode === "INSERT" ? "I" : mode[0];
  const icon = widgetFlag(widget, "nerdFont") ? VIM_NERD_FONT_ICON : VIM_ICON;
  if (format === "letter") return letter;
  if (format === "icon") return icon;
  if (format === "icon-letter") return `${icon} ${letter}`;
  return `${icon}-${letter}`;
}

function formatSkills(skills, widget) {
  const configuredMode = String(metadataValue(widget, "mode") || widget.view || "current");
  const mode = ["current", "count", "list"].includes(configuredMode) ? configuredMode : "current";
  const hideWhenEmpty = Boolean(widget.hideEmpty) || metadataFlag(widget, "hideWhenEmpty") === true;
  if (mode === "count") {
    const total = Number(skills.totalInvocations || 0);
    return total ? String(total) : hideWhenEmpty ? "" : "0";
  }
  if (mode === "list") {
    const unique = Array.isArray(skills.uniqueSkills) ? skills.uniqueSkills : [];
    if (!unique.length) return hideWhenEmpty ? "" : "none";
    const limit = Number(metadataValue(widget, "limit") || metadataValue(widget, "listLimit") || 0);
    const visible = limit > 0 ? unique.slice(0, limit) : unique;
    return visible.join(", ");
  }
  return skills.lastSkill || (hideWhenEmpty ? "" : "none");
}

function accountEmailValue(state = {}) {
  return state.accountEmail || process.env.CODEX_ACCOUNT_EMAIL || readClaudeAccountEmail() || "";
}

function readClaudeAccountEmail() {
  const data = readJson(claudeJsonPath(), null);
  const email = data?.oauthAccount?.emailAddress || data?.user?.email || "";
  return typeof email === "string" && email.trim() ? email.trim() : "";
}

function claudeJsonPath() {
  return process.env.CLAUDE_CONFIG_DIR
    ? join(process.env.CLAUDE_CONFIG_DIR, ".claude.json")
    : homePath(".claude.json");
}

function resolveVoiceStatus(state = {}, cwd = process.cwd()) {
  if (state.voiceStatus !== null && state.voiceStatus !== undefined) return state.voiceStatus;
  return readClaudeVoiceStatus(cwd);
}

function readClaudeVoiceStatus(cwd = process.cwd()) {
  const candidates = Array.from(new Set([
    join(cwd || process.cwd(), ".claude", "settings.local.json"),
    join(cwd || process.cwd(), ".claude", "settings.json"),
    join(claudeConfigDir(), "settings.local.json"),
    join(claudeConfigDir(), "settings.json")
  ]));
  let anyFile = false;
  for (const path of candidates) {
    const data = readJson(path, null);
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    anyFile = true;
    if (typeof data.voice?.enabled === "boolean") return data.voice.enabled;
  }
  return anyFile ? false : null;
}

function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || homePath(".claude");
}

export function formatPullRequestInfo(item, widget = {}) {
  if (!item) return "";
  const showStatus = metadataFlag(widget, "hideStatus") !== true;
  const showTitle = metadataFlag(widget, "hideTitle") !== true;
  const noun = pullRequestNoun(item);
  const number = item.number || "";
  const linkText = widget.label === "" || widget.rawValue ? `#${number}` : `${noun} #${number}`;
  const parts = [item.url ? osc8(item.url, linkText) : linkText];
  const status = pullRequestStatusLabel(item);
  if (showStatus && status) parts.push(status);
  if (showTitle && item.title) parts.push(truncatePullRequestTitle(item.title, Number(widget.titleWidth || 30)));
  return parts.filter(Boolean).join(" ");
}

function pullRequestNoun(item, git = null) {
  const provider = String(item?.provider || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  const host = String(git?.origin?.host || git?.upstreamRemote?.host || "").toLowerCase();
  return provider.includes("gitlab") || provider === "glab" || url.includes("/-/merge_requests/") || url.includes("gitlab") || host.includes("gitlab")
    ? "MR"
    : "PR";
}

function pullRequestStatusLabel(item) {
  const state = String(item.state || "").toUpperCase();
  const review = String(item.reviewDecision || "").toUpperCase();
  if (state === "MERGED") return "MERGED";
  if (state === "CLOSED" || state === "CLOSE") return "CLOSED";
  if (review === "APPROVED") return "APPROVED";
  if (review === "CHANGES_REQUESTED") return "CHANGES_REQ";
  if (state === "OPEN" || state === "OPENED") return "OPEN";
  if (state === "DRAFT") return "DRAFT";
  return state;
}

function truncatePullRequestTitle(title, width) {
  const limit = Number.isFinite(width) && width > 1 ? Math.floor(width) : 30;
  const text = String(title || "");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}\u2026`;
}

function blockProgress(startedAtMs, nowMs = Date.now()) {
  const elapsedSinceStart = Math.max(0, nowMs - startedAtMs);
  const elapsed = elapsedSinceStart % FIVE_HOURS_MS;
  const remaining = FIVE_HOURS_MS - elapsed;
  return {
    elapsed,
    remaining,
    ratio: elapsed / FIVE_HOURS_MS,
    resetAt: new Date(nowMs + remaining)
  };
}

function weekProgress(now = new Date()) {
  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  const elapsed = now.getTime() - start.getTime();
  const remaining = WEEK_MS - elapsed;
  return {
    elapsed,
    remaining,
    ratio: elapsed / WEEK_MS,
    resetAt: new Date(start.getTime() + WEEK_MS)
  };
}

function renderBar(ratio, width, style) {
  const chars = barChars(style);
  const safeWidth = barWidth(width, 16);
  const percent = clampPercent(Number(ratio) * 100);
  const filled = Math.max(0, Math.min(safeWidth, Math.round((percent / 100) * safeWidth)));
  return `${chars.left}${chars.full.repeat(filled)}${chars.empty.repeat(safeWidth - filled)}${chars.right} ${Math.round(percent)}%`;
}

function renderProgressBar(percent, width, style, options = {}) {
  const chars = progressChars(style);
  const safeWidth = barWidth(width, 16);
  const clamped = clampPercent(percent);
  const filled = Math.max(0, Math.min(safeWidth, Math.round((clamped / 100) * safeWidth)));
  const cursor = cursorIndex(options.cursor, safeWidth);
  let body = "";
  for (let index = 0; index < safeWidth; index += 1) {
    body += index === cursor ? chars.cursor : index < filled ? chars.full : chars.empty;
  }
  const bar = `${chars.left}${body}${chars.right}`;
  return options.showPercent === false ? bar : `${bar} ${formatPercent(clamped, options.decimals ?? 0)}`;
}

function renderSlider(percent, width, cursorPercent = null) {
  const safeWidth = barWidth(width, 10);
  const clamped = clampPercent(percent);
  const filled = Math.max(0, Math.min(safeWidth, Math.round((clamped / 100) * safeWidth)));
  const cursor = cursorIndex(cursorPercent, safeWidth);
  let output = "";
  for (let index = 0; index < safeWidth; index += 1) {
    output += index === cursor ? "\u2502" : index < filled ? "\u2593" : "\u2591";
  }
  return output;
}

function cursorIndex(percent, width) {
  if (percent === null || percent === undefined) return -1;
  if (!Number.isFinite(Number(percent)) || width <= 0) return -1;
  return Math.max(0, Math.min(width - 1, Math.round((clampPercent(percent) / 100) * width)));
}

function formatPercent(percent, decimals = 0) {
  const clamped = clampPercent(percent);
  return `${decimals > 0 ? clamped.toFixed(decimals) : Math.round(clamped)}%`;
}

function clampPercent(percent) {
  const number = Number(percent);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function barWidth(width, fallback) {
  const number = Number(width);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

export function formatResetTimer(progress, widget = {}, options = {}) {
  const display = usageDisplayMode(widget);
  if (display) return renderPercentDisplay((progress.ratio || 0) * 100, widget);

  const mode = resetTimerMode(widget);
  if (mode === "timestamp" || mode === "time" || mode === "clock") return formatResetTimestamp(progress.resetAt, widget);
  if (mode === "iso") return progress.resetAt instanceof Date ? progress.resetAt.toISOString() : "";
  if (mode === "both") {
    const duration = options.usageDuration
      ? formatUsageDuration(progress.remaining, metadataFlag(widget, "compact") === true, options.useDays !== false)
      : formatDuration(progress.remaining);
    const timestamp = formatResetTimestamp(progress.resetAt, widget);
    return timestamp ? `${duration} (${timestamp})` : duration;
  }
  if (mode === "bar" || mode === "progress") return renderBar(progress.ratio, Number(widget.width || 16), widget.style);
  return options.usageDuration
    ? formatUsageDuration(progress.remaining, metadataFlag(widget, "compact") === true, options.useDays !== false)
    : formatDuration(progress.remaining);
}

function resetTimerMode(widget = {}) {
  if (widget.mode || widget.format) return widget.mode || widget.format;
  if (metadataFlag(widget, "absolute") === true || widget.absolute || widget.timestamp) return "timestamp";
  return "duration";
}

function formatResetTimestamp(date, widget = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const options = {
    hour: "2-digit",
    minute: "2-digit"
  };
  if (widget.date || widget.includeDate) {
    options.month = "short";
    options.day = "numeric";
  }
  const timeZone = metadataValue(widget, "timezone") || widget.timezone || widget.timeZone;
  if (timeZone) options.timeZone = timeZone;
  const hour12 = parseBooleanOption(widget.hour12 ?? widget.twelveHour);
  if (hour12 !== null) options.hour12 = hour12;

  try {
    return new Intl.DateTimeFormat(widget.locale || "en", options).format(date);
  } catch {
    const fallback = { ...options };
    delete fallback.timeZone;
    return new Intl.DateTimeFormat(widget.locale || "en", fallback).format(date);
  }
}

function parseBooleanOption(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && /^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  return null;
}

function barChars(style = "ascii") {
  if (style === "blocks") return { left: "", right: "", full: "█", empty: "░" };
  if (style === "dots") return { left: "", right: "", full: "●", empty: "○" };
  return { left: "[", right: "]", full: "#", empty: "-" };
}

function progressChars(style = "blocks") {
  if (style === "ascii") return { left: "[", right: "]", full: "#", empty: "-", cursor: "|" };
  if (style === "dots") return { left: "[", right: "]", full: "●", empty: "○", cursor: "\u2502" };
  return { left: "[", right: "]", full: "█", empty: "░", cursor: "\u2502" };
}

function fishPath(path) {
  const prefix = path.startsWith("~/") ? "~/" : path.startsWith("/") ? "/" : "";
  const parts = path.replace(/^~?\//, "").split("/").filter(Boolean);
  if (parts.length <= 1) return path;
  return `${prefix}${parts.slice(0, -1).map((part) => part[0] || "").join("/")}/${parts.at(-1)}`;
}

function rootDirName(root) {
  if (!root) return "";
  const trimmed = String(root).replace(/[\\/]+$/, "");
  const normalized = trimmed || String(root);
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || normalized;
}

function renderRemoteValue(remote, text, widget, emptyText) {
  if (!text) return metadataFlag(widget, "hideNoRemote") ? "" : emptyText;
  if (!metadataFlag(widget, "linkToRepo")) return text;
  return osc8(repoWebUrl(remote), text) || text;
}

function formatGitWorktree(git, widget = {}) {
  if (!git.isRepo) return gitNoGit(widget, `${WORKTREE_ICON} no git`);
  const value = git.worktree?.linked ? git.worktree?.name || "worktree" : "main";
  return widget.rawValue || widget.label !== undefined ? value : `${WORKTREE_ICON} ${value}`;
}

function gitNoGit(widget, text = "(no git)") {
  return metadataFlag(widget, "hideNoGit") === true ? "" : text;
}

function memoryUsage() {
  const total = os.totalmem();
  const used = os.platform() === "darwin" ? usedMemoryMacOs() ?? (total - os.freemem()) : total - os.freemem();
  return `${formatBytes(used)}/${formatBytes(total)}`;
}

function usedMemoryMacOs() {
  const result = run("vm_stat", [], { timeout: 1000 });
  if (!result.ok) return null;
  const firstLine = result.stdout.split(/\r?\n/)[0] || "";
  const pageSize = Number(firstLine.match(/page size of (\d+) bytes/)?.[1] || 0);
  if (!pageSize) return null;
  let active = 0;
  let wired = 0;
  for (const line of result.stdout.split(/\r?\n/)) {
    const activeMatch = line.match(/Pages active:\s+([\d.]+)/);
    if (activeMatch) active = Number(activeMatch[1].replace(/\./g, ""));
    const wiredMatch = line.match(/Pages wired down:\s+([\d.]+)/);
    if (wiredMatch) wired = Number(wiredMatch[1].replace(/\./g, ""));
  }
  return (active + wired) * pageSize;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)}G`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)}M`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)}K`;
  return `${value}B`;
}

function linkUrl(widget) {
  return widget?.href || widget?.url || metadataValue(widget, "url") || "";
}

function linkText(widget, url = linkUrl(widget)) {
  return metadataValue(widget, "text") || widget?.text || url || "no url";
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function commandStdin(context) {
  return `${JSON.stringify({
    cwd: context.cwd || process.cwd(),
    model: context.state?.model || context.codexConfig?.model || "",
    state: context.state || {},
    git: context.git || {},
    codexConfig: context.codexConfig || {},
    config: context.config || {}
  })}\n`;
}

function gitBranchLinkEnabled(widget) {
  const linkToRepo = metadataFlag(widget, "linkToRepo");
  if (linkToRepo !== null) return linkToRepo;
  return metadataFlag(widget, "linkToGitHub") === true;
}

function formatGitBranch(branch, widget = {}) {
  return widget.rawValue || widget.label === "" ? branch : `${GIT_BRANCH_ICON} ${branch}`;
}

function formatGitStatusIndicators(status = {}) {
  const parts = [];
  if (status.conflicts) parts.push("!");
  if (status.staged) parts.push("+");
  if (status.unstaged) parts.push("*");
  if (status.untracked) parts.push("?");
  return parts.join("");
}

function formatGitFlag(count, widget = {}, symbol) {
  if (!count) return "";
  return widget.rawValue || widget.label === "" ? "true" : widget.character || symbol;
}

function formatGitCount(prefix, count, widget = {}) {
  const value = Number(count || 0);
  return widget.rawValue || widget.label === "" ? String(value) : `${prefix}:${value}`;
}

function formatGitClean(clean, widget = {}) {
  if (widget.rawValue || widget.label === "") return clean ? "clean" : "dirty";
  return clean ? "\u2713" : "\u2717";
}

function formatGitAheadBehind(status = {}, widget = {}) {
  const ahead = Number(status.ahead || 0);
  const behind = Number(status.behind || 0);
  if (!ahead && !behind) return "";
  if (widget.rawValue || widget.label === "") return `${ahead},${behind}`;
  return `${ahead ? `\u2191${ahead}` : ""}${behind ? `\u2193${behind}` : ""}`;
}

function formatGitChanges(git = {}) {
  const { insertions, deletions } = gitChangeCounts(git);
  return `(+${insertions},-${deletions})`;
}

function gitChangeCounts(git = {}) {
  return {
    insertions: Number(git.diff?.insertions || 0) + Number(git.stagedDiff?.insertions || 0),
    deletions: Number(git.diff?.deletions || 0) + Number(git.stagedDiff?.deletions || 0)
  };
}

function metadataFlag(widget, key) {
  if (!widget || typeof widget !== "object") return null;
  if (widget[key] !== undefined) return parseFlag(widget[key]);
  if (widget.metadata && typeof widget.metadata === "object" && widget.metadata[key] !== undefined) {
    return parseFlag(widget.metadata[key]);
  }
  return null;
}

function parseFlag(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (!text || ["false", "0", "no", "off"].includes(text)) return false;
    if (["true", "1", "yes", "on"].includes(text)) return true;
  }
  return Boolean(value);
}

function repoWebUrl(remote) {
  if (!remote) return "";
  if (remote.httpsUrl) return remote.httpsUrl;
  if (remote.host && remote.owner && remote.repo) return `https://${remote.host}/${remote.owner}/${remote.repo}`;
  if (typeof remote.url === "string" && /^https?:\/\//i.test(remote.url)) return remote.url.replace(/\.git\/?$/, "").replace(/\/$/, "");
  return "";
}

function branchWebUrl(remote, branch) {
  const url = repoWebUrl(remote);
  if (!url) return "";
  return `${url}/tree/${encodeGitRefForUrlPath(branch)}`;
}

function encodeGitRefForUrlPath(ref) {
  return String(ref || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function ideLinkMode(widget) {
  const configured = metadataValue(widget, "linkToIDE");
  if (configured === "vscode" || configured === "cursor") return configured;
  return metadataFlag(widget, "linkToCursor") === true ? "cursor" : "";
}

function metadataValue(widget, key) {
  if (!widget || typeof widget !== "object") return undefined;
  if (widget[key] !== undefined) return widget[key];
  if (widget.metadata && typeof widget.metadata === "object") return widget.metadata[key];
  return undefined;
}

function buildIdeFileUrl(path, mode) {
  const normalizedPath = String(path || "").replace(/\\/g, "/");
  const unc = normalizedPath.match(/^\/\/([^/]+)(\/.*)?$/);
  if (unc) return `${mode}://file//${unc[1]}${encodeFilePathForUri(unc[2] || "/")}`;

  const drive = normalizedPath.match(/^([A-Za-z]:)(\/.*)?$/);
  if (drive) return `${mode}://file/${drive[1]}${encodeFilePathForUri(drive[2] || "/")}`;

  return `${mode}://file${encodeFilePathForUri(normalizedPath)}`;
}

function encodeFilePathForUri(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function osc8(url, text) {
  if (!url || !text) return "";
  return `\x1b]8;;${String(url).replace(/\x1b/g, "")}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function getPullRequestInfo(cwd) {
  const gh = run("gh", ["pr", "view", "--json", "number,title,url,state,isDraft,reviewDecision,headRefName,baseRefName,changedFiles,additions,deletions,comments,commits"], { cwd, timeout: 1500 });
  if (gh.ok && gh.stdout.trim()) {
    try {
      return parseGithubPullRequest(JSON.parse(gh.stdout));
    } catch {
      return null;
    }
  }

  const glab = run("glab", ["mr", "view", "--output", "json"], { cwd, timeout: 1500 });
  if (glab.ok && glab.stdout.trim()) {
    try {
      return parseGitlabMergeRequest(JSON.parse(glab.stdout));
    } catch {
      return null;
    }
  }

  return null;
}

export function parseGithubPullRequest(parsed) {
  const number = parsed.number;
  const title = parsed.title || "";
  const state = parsed.isDraft ? "DRAFT" : parsed.state || "";
  const label = `PR #${number}${title ? ` ${title}` : ""}`;
  return {
    provider: "github",
    number,
    title,
    label,
    url: parsed.url || "",
    state,
    reviewDecision: parsed.reviewDecision || "",
    headRefName: parsed.headRefName || "",
    baseRefName: parsed.baseRefName || "",
    changedFiles: Number(parsed.changedFiles || 0),
    additions: Number(parsed.additions || 0),
    deletions: Number(parsed.deletions || 0),
    comments: countMaybeArray(parsed.comments),
    commits: countMaybeArray(parsed.commits)
  };
}

export function parseGitlabMergeRequest(parsed) {
  const iid = parsed.iid || parsed.id || parsed.reference || "";
  const title = parsed.title || "";
  const stats = parsed.diff_stats || parsed.diffStats || {};
  const label = `MR !${iid}${title ? ` ${title}` : ""}`;
  return {
    provider: "gitlab",
    number: iid,
    title,
    label,
    url: parsed.web_url || parsed.webUrl || parsed.url || "",
    state: parsed.state || parsed.merge_status || parsed.mergeStatus || "",
    reviewDecision: parsed.approved ? "APPROVED" : "",
    headRefName: parsed.source_branch || parsed.sourceBranch || "",
    baseRefName: parsed.target_branch || parsed.targetBranch || "",
    changedFiles: Number(parsed.changes_count || parsed.changesCount || stats.files || 0),
    additions: Number(parsed.additions || stats.additions || 0),
    deletions: Number(parsed.deletions || stats.deletions || 0),
    comments: countMaybeArray(parsed.notes || parsed.discussions),
    commits: countMaybeArray(parsed.commits)
  };
}

function countMaybeArray(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && Array.isArray(value.nodes)) return value.nodes.length;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
