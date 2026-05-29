import os from "node:os";
import { basename, join } from "node:path";
import { compactNumber, formatDuration, numberFormat, readJson, repoRoot, run } from "./util.js";

export const SPACER = "__CXSTATUSLINE_SPACER__";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PACKAGE = readJson(join(repoRoot, "package.json"), {});

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
    render: ({ state, codexConfig }) => state.model || codexConfig.model || process.env.CODEX_MODEL || ""
  },
  reasoning: {
    description: "Configured model reasoning effort",
    render: ({ codexConfig }) => codexConfig.model_reasoning_effort || codexConfig.modelReasoningEffort || ""
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
      if (!git.isRepo || !git.branch) return "";
      if (git.branch !== "(detached)" && gitBranchLinkEnabled(widget)) {
        return osc8(branchWebUrl(git.origin, git.branch), git.branch) || git.branch;
      }
      return git.branch;
    }
  },
  gitSha: {
    description: "Short Git commit SHA",
    render: ({ git }) => (git.isRepo ? git.sha : "")
  },
  gitStatus: {
    description: "Staged, unstaged, untracked, and conflict counts",
    render: ({ git }) => {
      if (!git.isRepo) return "";
      const s = git.status;
      if (s.clean) return "clean";
      const parts = [];
      if (s.staged) parts.push(`+${s.staged}`);
      if (s.unstaged) parts.push(`~${s.unstaged}`);
      if (s.untracked) parts.push(`?${s.untracked}`);
      if (s.conflicts) parts.push(`!${s.conflicts}`);
      return parts.join(" ");
    }
  },
  gitStaged: {
    description: "Number of staged files",
    render: ({ git }) => git.isRepo && git.status.staged ? String(git.status.staged) : ""
  },
  gitStagedFiles: {
    description: "Number of staged files",
    render: ({ git }) => git.isRepo && git.status.staged ? String(git.status.staged) : ""
  },
  gitUnstaged: {
    description: "Number of unstaged files",
    render: ({ git }) => git.isRepo && git.status.unstaged ? String(git.status.unstaged) : ""
  },
  gitUnstagedFiles: {
    description: "Number of unstaged files",
    render: ({ git }) => git.isRepo && git.status.unstaged ? String(git.status.unstaged) : ""
  },
  gitUntracked: {
    description: "Number of untracked files",
    render: ({ git }) => git.isRepo && git.status.untracked ? String(git.status.untracked) : ""
  },
  gitUntrackedFiles: {
    description: "Number of untracked files",
    render: ({ git }) => git.isRepo && git.status.untracked ? String(git.status.untracked) : ""
  },
  gitConflicts: {
    description: "Number of merge conflict files",
    render: ({ git }) => git.isRepo && git.status.conflicts ? String(git.status.conflicts) : ""
  },
  gitClean: {
    description: "Git clean or dirty state",
    render: ({ git }) => git.isRepo ? (git.status.clean ? "clean" : "dirty") : ""
  },
  gitCleanStatus: {
    description: "Git clean or dirty state",
    render: ({ git }) => git.isRepo ? (git.status.clean ? "clean" : "dirty") : ""
  },
  gitAheadBehind: {
    description: "Git upstream ahead and behind counts",
    render: ({ git }) => {
      if (!git.isRepo) return "";
      const parts = [];
      if (git.status.ahead) parts.push(`ahead ${git.status.ahead}`);
      if (git.status.behind) parts.push(`behind ${git.status.behind}`);
      return parts.join(" ");
    }
  },
  gitChanges: {
    description: "Uncommitted insertions and deletions",
    render: ({ git }) => {
      if (!git.isRepo) return "";
      const parts = [];
      const inserted = git.diff.insertions + git.stagedDiff.insertions;
      const deleted = git.diff.deletions + git.stagedDiff.deletions;
      if (inserted) parts.push(`+${inserted}`);
      if (deleted) parts.push(`-${deleted}`);
      return parts.join(" ");
    }
  },
  gitInsertions: {
    description: "Uncommitted insertion count",
    render: ({ git }) => {
      if (!git.isRepo) return "";
      const inserted = git.diff.insertions + git.stagedDiff.insertions;
      return inserted ? `+${inserted}` : "";
    }
  },
  gitDeletions: {
    description: "Uncommitted deletion count",
    render: ({ git }) => {
      if (!git.isRepo) return "";
      const deleted = git.diff.deletions + git.stagedDiff.deletions;
      return deleted ? `-${deleted}` : "";
    }
  },
  gitOriginOwner: {
    description: "Origin remote owner",
    render: ({ git, widget }) => renderRemoteValue(git.origin, git.origin?.owner, widget, "no remote")
  },
  gitOriginRepo: {
    description: "Origin remote repository name",
    render: ({ git, widget }) => renderRemoteValue(git.origin, git.origin?.repo, widget, "no remote")
  },
  gitOriginOwnerRepo: {
    description: "Origin owner/repository",
    render: ({ git, widget }) => {
      const text = metadataFlag(widget, "ownerOnlyWhenFork") && git.isFork ? git.origin?.owner : git.origin?.ownerRepo;
      return renderRemoteValue(git.origin, text, widget, "no remote");
    }
  },
  gitUpstream: {
    description: "Configured upstream branch",
    render: ({ git }) => git.upstream || ""
  },
  gitUpstreamOwner: {
    description: "Upstream remote owner",
    render: ({ git, widget }) => renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.owner, widget, "no upstream")
  },
  gitUpstreamRepo: {
    description: "Upstream remote repository name",
    render: ({ git, widget }) => renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.repo, widget, "no upstream")
  },
  gitUpstreamOwnerRepo: {
    description: "Upstream owner/repository",
    render: ({ git, widget }) => renderRemoteValue(git.upstreamRemote, git.upstreamRemote?.ownerRepo, widget, "no upstream")
  },
  gitIsFork: {
    description: "Whether origin differs from upstream remote",
    render: ({ git }) => git.isRepo && git.upstreamRemote?.ownerRepo ? (git.isFork ? "fork" : "upstream") : ""
  },
  gitWorktreeMode: {
    description: "Whether the repository is a linked worktree",
    render: ({ git }) => git.isRepo ? (git.worktree?.linked ? "worktree" : "normal") : ""
  },
  gitWorktree: {
    description: "Current Git worktree name when in a linked worktree",
    render: ({ git }) => git.worktree?.linked ? git.worktree?.name || "worktree" : ""
  },
  gitWorktreeName: {
    description: "Current worktree directory name",
    render: ({ git }) => git.worktree?.name || ""
  },
  gitWorktreeBranch: {
    description: "Current worktree branch name",
    render: ({ git }) => git.worktree?.branch || ""
  },
  gitWorktreeOriginalBranch: {
    description: "Upstream branch name associated with the current worktree",
    render: ({ git }) => git.worktree?.originalBranch || ""
  },
  tokens: {
    description: "Total session token usage from hook or transcript state",
    render: ({ state }) => {
      const total = state.usage?.totalTokens;
      return total ? compactNumber(total) : "";
    }
  },
  inputTokens: {
    description: "Total input tokens",
    render: ({ state }) => state.usage?.inputTokens ? compactNumber(state.usage.inputTokens) : ""
  },
  outputTokens: {
    description: "Total output tokens",
    render: ({ state }) => state.usage?.outputTokens ? compactNumber(state.usage.outputTokens) : ""
  },
  cachedTokens: {
    description: "Cached token count when present in hook state",
    render: ({ state }) => state.usage?.cachedTokens ? compactNumber(state.usage.cachedTokens) : ""
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
    description: "Token speed per minute from recent hook samples",
    render: ({ state, widget }) => {
      const speed = tokenSpeed(state.samples || [], Number(widget.windowSeconds || 120), "totalTokens");
      return speed ? `${compactNumber(Math.round(speed))}/min` : "";
    }
  },
  totalSpeed: {
    description: "Total token speed per minute from recent hook samples",
    render: ({ state, widget }) => {
      const speed = tokenSpeed(state.samples || [], Number(widget.windowSeconds || 120), "totalTokens");
      return speed ? `${compactNumber(Math.round(speed))}/min` : "";
    }
  },
  inputSpeed: {
    description: "Input token speed per minute from recent hook samples",
    render: ({ state, widget }) => {
      const speed = tokenSpeed(state.samples || [], Number(widget.windowSeconds || 120), "inputTokens");
      return speed ? `${compactNumber(Math.round(speed))}/min` : "";
    }
  },
  outputSpeed: {
    description: "Output token speed per minute from recent hook samples",
    render: ({ state, widget }) => {
      const speed = tokenSpeed(state.samples || [], Number(widget.windowSeconds || 120), "outputTokens");
      return speed ? `${compactNumber(Math.round(speed))}/min` : "";
    }
  },
  contextWindow: {
    description: "Context window size, using state or model-name inference",
    render: ({ state, codexConfig }) => {
      const usage = state.usage || {};
      const inferred = inferContextWindow(state.model || codexConfig.model || "");
      return usage.contextWindow || inferred ? compactNumber(usage.contextWindow || inferred) : "";
    }
  },
  contextPercent: {
    description: "Context window used percentage",
    render: ({ state, widget }) => {
      const { used, window, remaining } = contextNumbers(state.usage || {});
      const value = widget.mode === "remaining" ? remaining : used;
      if (!used || !window) return "";
      return `${Math.round((value / window) * 100)}%`;
    }
  },
  contextPercentage: {
    description: "Context window used percentage",
    render: ({ state, widget }) => renderContextPercent(state.usage || {}, widget)
  },
  contextPercentageUsable: {
    description: "Context window usable percentage when available, otherwise context percentage",
    render: ({ state, widget }) => renderContextPercent(state.usage || {}, widget)
  },
  contextBar: {
    description: "Context usage bar",
    render: ({ state, widget }) => {
      const { used, window, remaining } = contextNumbers(state.usage || {});
      if (!used || !window) return "";
      const width = Number(widget.width || 10);
      const value = widget.mode === "remaining" ? remaining : used;
      const filled = Math.max(0, Math.min(width, Math.round((value / window) * width)));
      const chars = barChars(widget.style);
      return `${chars.left}${chars.full.repeat(filled)}${chars.empty.repeat(width - filled)}${chars.right} ${Math.round((value / window) * 100)}%`;
    }
  },
  contextTokens: {
    description: "Context usage as used/total tokens",
    render: ({ state }) => {
      const { used, window } = contextNumbers(state.usage || {});
      if (!used || !window) return "";
      return `${compactNumber(used)}/${compactNumber(window)}`;
    }
  },
  contextUsed: {
    description: "Context tokens used",
    render: ({ state }) => {
      const { used } = contextNumbers(state.usage || {});
      return used ? compactNumber(used) : "";
    }
  },
  contextLength: {
    description: "Context tokens used",
    render: ({ state }) => {
      const { used } = contextNumbers(state.usage || {});
      return used ? compactNumber(used) : "";
    }
  },
  contextRemaining: {
    description: "Context remaining percentage",
    render: ({ state }) => {
      const { remaining, window } = contextNumbers(state.usage || {});
      if (!remaining || !window) return "";
      return `${Math.round((remaining / window) * 100)}%`;
    }
  },
  contextRemainingTokens: {
    description: "Context tokens remaining",
    render: ({ state }) => {
      const { remaining } = contextNumbers(state.usage || {});
      return remaining ? compactNumber(remaining) : "";
    }
  },
  cost: {
    description: "Session cost in USD when present in hook state",
    render: ({ state }) => {
      const cost = state.usage?.costUsd;
      return Number.isFinite(Number(cost)) ? `$${Number(cost).toFixed(2)}` : "";
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
    })
  },
  weeklyUsage: {
    description: "Weekly usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklyUsagePercent",
      used: "weeklyUsageUsed",
      remaining: "weeklyUsageRemaining"
    })
  },
  weeklySonnetUsage: {
    description: "Weekly Sonnet usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklySonnetUsagePercent",
      used: "weeklySonnetUsageUsed",
      remaining: "weeklySonnetUsageRemaining"
    })
  },
  weeklyOpusUsage: {
    description: "Weekly Opus usage percentage or bar when present in hook state",
    render: ({ state, widget }) => renderUsagePercent(state.usage || {}, widget, {
      percent: "weeklyOpusUsagePercent",
      used: "weeklyOpusUsageUsed",
      remaining: "weeklyOpusUsageRemaining"
    })
  },
  extraUsageRemaining: {
    description: "Extra usage remaining when present in hook state",
    render: ({ state }) => state.usage?.extraUsageRemaining ? compactNumber(state.usage.extraUsageRemaining) : ""
  },
  extraUsageUtilization: {
    description: "Extra usage utilization when present in hook state",
    render: ({ state }) => {
      const used = Number(state.usage?.extraUsageUsed || 0);
      const remaining = Number(state.usage?.extraUsageRemaining || 0);
      if (!used || !remaining) return "";
      return `${Math.round((used / (used + remaining)) * 100)}%`;
    }
  },
  duration: {
    description: "Elapsed time since SessionStart hook",
    render: ({ state }) => state.startedAt ? formatDuration(Date.now() - Date.parse(state.startedAt)) : ""
  },
  blockTimer: {
    description: "Elapsed time within the current five-hour usage block",
    render: ({ state }) => state.startedAt ? formatDuration(blockProgress(Date.parse(state.startedAt)).elapsed) : ""
  },
  blockRemaining: {
    description: "Remaining time in the current five-hour usage block",
    render: ({ state }) => state.startedAt ? formatDuration(blockProgress(Date.parse(state.startedAt)).remaining) : ""
  },
  blockResetTimer: {
    description: "Remaining time or reset timestamp for the current five-hour usage block",
    render: ({ state, widget }) => state.startedAt ? formatResetTimer(blockProgress(Date.parse(state.startedAt)), widget) : ""
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
    render: ({ widget }) => formatResetTimer(weekProgress(), widget)
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
    render: ({ state }) => state.sessionId ? String(state.sessionId).slice(0, 8) : ""
  },
  sessionName: {
    description: "Current session name or thread title when present in hook state",
    render: ({ state }) => state.sessionName || ""
  },
  sessionClock: {
    description: "Elapsed time since SessionStart hook",
    render: ({ state }) => state.startedAt ? formatDuration(Date.now() - Date.parse(state.startedAt)) : ""
  },
  version: {
    description: "cxstatusline version or Codex version when present in hook state",
    render: ({ state, widget }) => {
      const version = widget.source === "codex" ? state.version : state.version || PACKAGE.version;
      return version ? `v${String(version).replace(/^v/, "")}` : "";
    }
  },
  outputStyle: {
    description: "Current output style when present in hook state or config",
    render: ({ state, codexConfig }) => state.outputStyle || codexConfig.output_style || codexConfig.outputStyle || ""
  },
  vimMode: {
    description: "Current editor vim mode when present in hook state",
    render: ({ state, widget }) => state.vimMode ? formatVimMode(state.vimMode, widget) : ""
  },
  voiceStatus: {
    description: "Voice input status when present in hook state",
    render: ({ state }) => formatOnOff(state.voiceStatus, "voice")
  },
  remoteControlStatus: {
    description: "Remote control status when present in hook state",
    render: ({ state }) => formatOnOff(state.remoteControlStatus, "remote")
  },
  skills: {
    description: "Skill invocation metrics when present in hook state",
    render: ({ state, widget }) => formatSkills(state.skills || {}, widget)
  },
  accountEmail: {
    description: "Account email when present in hook state or environment",
    render: ({ state }) => state.accountEmail || process.env.CODEX_ACCOUNT_EMAIL || ""
  },
  claudeAccountEmail: {
    description: "Claude-compatible alias for account email when present",
    render: ({ state }) => state.accountEmail || process.env.CODEX_ACCOUNT_EMAIL || ""
  },
  compactions: {
    description: "Count of observed context compactions",
    render: ({ state }) => state.compactions ? String(state.compactions) : ""
  },
  memory: {
    description: "System memory utilization",
    render: () => {
      const total = os.totalmem();
      const used = total - os.freemem();
      return `${numberFormat(used / 1024 / 1024 / 1024)}/${numberFormat(total / 1024 / 1024 / 1024)}GB`;
    }
  },
  terminalWidth: {
    description: "Detected terminal width",
    render: () => process.env.CXSTATUSLINE_WIDTH || process.env.CCSTATUSLINE_WIDTH || process.env.COLUMNS || ""
  },
  text: {
    description: "Custom literal text",
    render: ({ widget }) => widget.text || ""
  },
  symbol: {
    description: "Custom symbol or short text",
    render: ({ widget }) => widget.symbol || widget.text || ""
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
      if (!url) return text;
      return osc8(url, text) || text;
    }
  },
  gitBranchLink: {
    description: "Clickable GitHub/GitLab branch link when origin is known",
    render: ({ git }) => {
      if (!git.isRepo || !git.branch || git.branch === "(detached)") return "";
      return osc8(branchWebUrl(git.origin, git.branch), git.branch);
    }
  },
  gitPullRequest: {
    description: "Current GitHub pull request or GitLab merge request when gh/glab is available",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      const item = getPullRequestInfo(cwd || git.root);
      if (!item) return "";
      return item.url ? osc8(item.url, item.label) : item.label;
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
    render: ({ cwd }) => {
      const output = jjOutput(["workspace", "list", "--template", "if(target.current_working_copy(), name ++ \"\\n\")"], cwd);
      return output ? output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "" : "";
    }
  },
  jjRevision: {
    description: "Current Jujutsu revision id",
    render: ({ cwd }) => jj(["log", "-r", "@", "--no-graph", "-T", "change_id.shortest()"], cwd)
  },
  jjDescription: {
    description: "Current Jujutsu change description",
    render: ({ cwd }) => {
      const output = jjOutput(["log", "-r", "@", "--no-graph", "-T", "description.first_line()"], cwd, { allowEmpty: true });
      if (output === null) return "";
      return output.trim() || "(no description)";
    }
  },
  jjBookmarks: {
    description: "Current Jujutsu bookmarks",
    render: ({ cwd }) => parseJjBookmarks(jjOutput(["log", "--no-graph", "-r", "heads(::@ & bookmarks())", "--template", "bookmarks"], cwd)).join(", ")
  },
  jjRootDir: {
    description: "Current Jujutsu root directory name",
    render: ({ cwd }) => {
      const root = jj(["root"], cwd);
      return root ? basename(root) : "";
    }
  },
  jjChanges: {
    description: "Current Jujutsu insertion/deletion summary",
    render: ({ cwd }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return "";
      return formatJjChangeSummary(parseJjStat(output));
    }
  },
  jjChangedFiles: {
    description: "Current Jujutsu changed file count",
    render: ({ cwd }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return "";
      return String(parseJjStat(output).files);
    }
  },
  jjStats: {
    description: "Current Jujutsu file, insertion, and deletion stats",
    render: ({ cwd }) => {
      const output = jjOutput(["diff", "--stat"], cwd, { allowEmpty: true });
      if (output === null) return "";
      const stat = parseJjStat(output);
      return `${stat.files} files +${stat.insertions} -${stat.deletions}`;
    }
  },
  jjBookmarkCount: {
    description: "Current Jujutsu bookmark count",
    render: ({ cwd }) => {
      const bookmarks = parseJjBookmarks(jjOutput(["log", "--no-graph", "-r", "heads(::@ & bookmarks())", "--template", "bookmarks"], cwd));
      return bookmarks.length ? String(bookmarks.length) : "";
    }
  },
  jjInsertions: {
    description: "Current Jujutsu insertion count",
    render: ({ cwd }) => {
      const stat = parseJjStat(jj(["diff", "--stat"], cwd));
      return stat.insertions ? `+${stat.insertions}` : "";
    }
  },
  jjDeletions: {
    description: "Current Jujutsu deletion count",
    render: ({ cwd }) => {
      const stat = parseJjStat(jj(["diff", "--stat"], cwd));
      return stat.deletions ? `-${stat.deletions}` : "";
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
  if (options.home !== false) {
    const home = os.homedir();
    if (output === home) output = "~";
    else if (output.startsWith(`${home}/`)) output = `~/${output.slice(home.length + 1)}`;
  }

  const segments = Number(options.segments || 0);
  if (segments > 0) {
    const prefix = output.startsWith("~/") ? "~/" : output.startsWith("/") ? "/" : "";
    const parts = output.replace(/^~?\//, "").split("/").filter(Boolean);
    if (parts.length > segments) output = `${prefix}.../${parts.slice(-segments).join("/")}`;
  }

  if (options.fish) output = fishPath(output);
  return output;
}

export function inferContextWindow(model) {
  const text = String(model || "").toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*([mk])(?:\s*context)?/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  return Math.round(value * (unit === "m" ? 1_000_000 : 1_000));
}

function tokenSpeed(samples, windowSeconds, key = "totalTokens") {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  const oldest = windowSeconds <= 0
    ? samples[0]
    : [...samples].reverse().find((sample) => Date.parse(sample.at) <= Date.parse(newest.at) - windowSeconds * 1000) || samples[0];
  const deltaTokens = Number(newest[key] || 0) - Number(oldest[key] || 0);
  const deltaMinutes = (Date.parse(newest.at) - Date.parse(oldest.at)) / 60000;
  if (deltaTokens <= 0 || deltaMinutes <= 0) return 0;
  return deltaTokens / deltaMinutes;
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

function contextNumbers(usage) {
  const used = Number(usage.contextUsed || 0);
  const window = Number(usage.contextWindow || (usage.contextRemaining && usage.contextUsed ? usage.contextRemaining + usage.contextUsed : 0));
  const remaining = Number(usage.contextRemaining || (window && used ? window - used : 0));
  return { used, window, remaining };
}

function renderContextPercent(usage, widget) {
  const { used, window, remaining } = contextNumbers(usage);
  const value = widget.mode === "remaining" ? remaining : used;
  if (!used || !window) return "";
  return `${Math.round((value / window) * 100)}%`;
}

function renderUsagePercent(usage, widget, keys) {
  const percent = usagePercent(usage, keys);
  if (!Number.isFinite(percent)) return "";
  const display = widget.mode === "remaining" ? 100 - percent : percent;
  const clamped = Math.max(0, Math.min(100, display));
  if (widget.mode === "bar" || widget.mode === "progress" || widget.style === "bar" || widget.display === "bar") {
    return renderBar(clamped / 100, Number(widget.width || 16), widget.barStyle || widget.style);
  }
  return `${Math.round(clamped)}%`;
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

function formatOnOff(value, label) {
  if (value === true) return `${label} on`;
  if (value === false) return `${label} off`;
  if (typeof value === "string" && value.trim()) return `${label} ${value.trim()}`;
  return "";
}

function formatVimMode(value, widget) {
  const mode = String(value || "").toUpperCase();
  if (!mode) return "";
  if (widget.format === "word") return mode;
  const letter = mode === "NORMAL" ? "N" : mode === "INSERT" ? "I" : mode[0];
  return widget.format === "letter" ? letter : `v-${letter}`;
}

function formatSkills(skills, widget) {
  const mode = widget.mode || widget.view || "current";
  if (mode === "count") return skills.totalInvocations ? String(skills.totalInvocations) : "";
  if (mode === "list") {
    const unique = Array.isArray(skills.uniqueSkills) ? skills.uniqueSkills : [];
    const limit = Number(widget.limit || widget.listLimit || 0);
    const visible = limit > 0 ? unique.slice(0, limit) : unique;
    return visible.join(", ");
  }
  return skills.lastSkill || "";
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
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return `${chars.left}${chars.full.repeat(filled)}${chars.empty.repeat(width - filled)}${chars.right} ${Math.round(ratio * 100)}%`;
}

export function formatResetTimer(progress, widget = {}) {
  const mode = widget.mode || widget.format || (widget.timestamp ? "timestamp" : "duration");
  if (mode === "timestamp" || mode === "time" || mode === "clock") return formatResetTimestamp(progress.resetAt, widget);
  if (mode === "iso") return progress.resetAt instanceof Date ? progress.resetAt.toISOString() : "";
  if (mode === "both") {
    const duration = formatDuration(progress.remaining);
    const timestamp = formatResetTimestamp(progress.resetAt, widget);
    return timestamp ? `${duration} (${timestamp})` : duration;
  }
  if (mode === "bar" || mode === "progress") return renderBar(progress.ratio, Number(widget.width || 16), widget.style);
  return formatDuration(progress.remaining);
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
  if (widget.timeZone) options.timeZone = widget.timeZone;
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

function linkUrl(widget) {
  return widget?.href || widget?.url || metadataValue(widget, "url") || "";
}

function linkText(widget, url = linkUrl(widget)) {
  return widget?.text || metadataValue(widget, "text") || url || "";
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
