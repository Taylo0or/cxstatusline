import os from "node:os";
import { basename } from "node:path";
import { compactNumber, formatDuration, numberFormat, run } from "./util.js";

export const SPACER = "__CXSTATUSLINE_SPACER__";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    render: ({ git }) => (git.isRepo ? git.branch : "")
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
  gitUnstaged: {
    description: "Number of unstaged files",
    render: ({ git }) => git.isRepo && git.status.unstaged ? String(git.status.unstaged) : ""
  },
  gitUntracked: {
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
    render: ({ git }) => git.origin?.owner || ""
  },
  gitOriginRepo: {
    description: "Origin remote repository name",
    render: ({ git }) => git.origin?.repo || ""
  },
  gitOriginOwnerRepo: {
    description: "Origin owner/repository",
    render: ({ git }) => git.origin?.ownerRepo || ""
  },
  gitUpstream: {
    description: "Configured upstream branch",
    render: ({ git }) => git.upstream || ""
  },
  gitWorktreeMode: {
    description: "Whether the repository is a linked worktree",
    render: ({ git }) => git.isRepo ? (git.worktree?.linked ? "worktree" : "normal") : ""
  },
  gitWorktreeName: {
    description: "Current worktree directory name",
    render: ({ git }) => git.worktree?.name || ""
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
  tokenSpeed: {
    description: "Token speed per minute from recent hook samples",
    render: ({ state, widget }) => {
      const speed = tokenSpeed(state.samples || [], Number(widget.windowSeconds || 120));
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
  text: {
    description: "Custom literal text",
    render: ({ widget }) => widget.text || ""
  },
  symbol: {
    description: "Custom symbol or short text",
    render: ({ widget }) => widget.symbol || widget.text || ""
  },
  spacer: {
    description: "Flexible spacer for right-aligned plain output",
    render: () => SPACER
  },
  link: {
    description: "OSC8 clickable link",
    render: ({ widget }) => osc8(widget.href || widget.url, widget.text || widget.href || widget.url || "")
  },
  gitBranchLink: {
    description: "Clickable GitHub/GitLab branch link when origin is known",
    render: ({ git }) => {
      if (!git.isRepo || !git.origin?.httpsUrl || !git.branch || git.branch === "(detached)") return "";
      const branch = encodeURIComponent(git.branch);
      const path = git.origin.host === "gitlab.com" ? `-/tree/${branch}` : `tree/${branch}`;
      return osc8(`${git.origin.httpsUrl}/${path}`, git.branch);
    }
  },
  gitPullRequest: {
    description: "Current GitHub pull request or GitLab merge request when gh/glab is available",
    render: ({ git, cwd }) => {
      if (!git.isRepo) return "";
      const item = findPullRequest(cwd || git.root);
      if (!item) return "";
      return item.url ? osc8(item.url, item.label) : item.label;
    }
  }
};

export function listWidgets() {
  return Object.entries(widgetRegistry).map(([name, widget]) => ({ name, description: widget.description }));
}

export function renderWidget(widget, context) {
  const type = typeof widget === "string" ? widget : widget.type;
  const definition = widgetRegistry[type];
  if (!definition) return "";
  const value = definition.render({ ...context, widget: typeof widget === "string" ? { type } : widget });
  if (!value) return "";
  if (value === SPACER) return SPACER;

  const label = typeof widget === "string" ? "" : widget.label;
  if (context.config.minimal || label === "") return String(value);
  return label ? `${label}: ${value}` : String(value);
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

function tokenSpeed(samples, windowSeconds) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  const cutoff = Date.parse(newest.at) - windowSeconds * 1000;
  const oldest = [...samples].reverse().find((sample) => Date.parse(sample.at) <= cutoff) || samples[0];
  const deltaTokens = Number(newest.totalTokens || 0) - Number(oldest.totalTokens || 0);
  const deltaMinutes = (Date.parse(newest.at) - Date.parse(oldest.at)) / 60000;
  if (deltaTokens <= 0 || deltaMinutes <= 0) return 0;
  return deltaTokens / deltaMinutes;
}

function contextNumbers(usage) {
  const used = Number(usage.contextUsed || 0);
  const window = Number(usage.contextWindow || (usage.contextRemaining && usage.contextUsed ? usage.contextRemaining + usage.contextUsed : 0));
  const remaining = Number(usage.contextRemaining || (window && used ? window - used : 0));
  return { used, window, remaining };
}

function blockProgress(startedAtMs, nowMs = Date.now()) {
  const elapsedSinceStart = Math.max(0, nowMs - startedAtMs);
  const elapsed = elapsedSinceStart % FIVE_HOURS_MS;
  const remaining = FIVE_HOURS_MS - elapsed;
  return { elapsed, remaining, ratio: elapsed / FIVE_HOURS_MS };
}

function weekProgress(now = new Date()) {
  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  const elapsed = now.getTime() - start.getTime();
  const remaining = WEEK_MS - elapsed;
  return { elapsed, remaining, ratio: elapsed / WEEK_MS };
}

function renderBar(ratio, width, style) {
  const chars = barChars(style);
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return `${chars.left}${chars.full.repeat(filled)}${chars.empty.repeat(width - filled)}${chars.right} ${Math.round(ratio * 100)}%`;
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

function osc8(url, text) {
  if (!url || !text) return "";
  return `\x1b]8;;${String(url).replace(/\x1b/g, "")}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function findPullRequest(cwd) {
  const gh = run("gh", ["pr", "view", "--json", "number,title,url", "--template", "{{.number}}\t{{.title}}\t{{.url}}"], { cwd, timeout: 1500 });
  if (gh.ok && gh.stdout.trim()) {
    const [number, title, url] = gh.stdout.trim().split("\t");
    return { label: `PR #${number}${title ? ` ${title}` : ""}`, url };
  }

  const glab = run("glab", ["mr", "view", "--output", "json"], { cwd, timeout: 1500 });
  if (glab.ok && glab.stdout.trim()) {
    try {
      const parsed = JSON.parse(glab.stdout);
      const iid = parsed.iid || parsed.id || parsed.reference;
      const title = parsed.title || "";
      const url = parsed.web_url || parsed.webUrl || parsed.url || "";
      return { label: `MR !${iid}${title ? ` ${title}` : ""}`, url };
    } catch {
      return null;
    }
  }

  return null;
}
