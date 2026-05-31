import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { HOOK_EVENTS } from "./constants.js";
import { applyPreset, loadConfig } from "./config.js";
import { codexConfigPath, readCodexConfig } from "./codexConfig.js";
import { getGitInfo } from "./git.js";
import { hooksPath, isCxHook } from "./install.js";
import { renderStatusLine } from "./render.js";
import { loadState, statePath } from "./state.js";
import { cacheDir, compactNumber, formatDuration, homePath, parseFlags, readJson, readText, repoRoot, safeStat } from "./util.js";

const SOURCE_PATH = join(repoRoot, "templates", "CxStatusIsland.swift");
const BINARY_PATH = join(cacheDir(), "island", "CxStatusIsland");

export function runIsland(args = []) {
  if (process.platform !== "darwin") {
    throw new Error("cxstatusline island is currently supported on macOS only.");
  }

  const { flags } = parseFlags(args);
  if (flags.stop || flags.quit) {
    return stopIsland();
  }

  const binary = ensureIslandBinary(Boolean(flags.rebuild || flags.force));
  const env = buildIslandEnv(flags);
  const childArgs = [];

  if (flags.detach) {
    const child = spawn(binary, childArgs, {
      detached: true,
      stdio: "ignore",
      env
    });
    child.unref();
    console.log(`island: started pid ${child.pid}`);
    return;
  }

  const result = spawnSync(binary, childArgs, {
    stdio: "inherit",
    env
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 0;
}

export async function renderIslandStatus(args = []) {
  const { flags } = parseFlags(args);
  const agent = resolveIslandAgent(flags.agent || flags.provider);
  if (agent !== "codex") {
    const payload = renderExternalAgentIslandStatus(agent, flags);
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const config = islandRenderConfig(flags);
  const state = loadState();
  const cwd = flags.cwd || state.cwd || process.cwd();
  const codexConfig = readCodexConfig();
  const git = getGitInfo(cwd, { ttlMs: config.gitCacheTtlMs });
  const rendered = renderStatusLine(
    { config, state, cwd, git, codexConfig },
    {
      theme: flags.theme,
      mode: flags.mode,
      format: "json",
      width: flags.width,
      color: flags["no-color"] ? false : flags.color !== "false"
    }
  );

  const payload = JSON.parse(rendered);
  const hookTrust = getHookTrustStatus();
  payload.detail = islandDetail({ cwd, state, hookTrust });
  payload.alerts = islandAlerts({ state, hookTrust });
  payload.hooks = hookTrust;
  payload.summary = islandSummary({ cwd, state, git, codexConfig, agent: "Codex", client: "Codex Terminal" });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function ensureIslandBinary(force = false) {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Missing Swift island source: ${SOURCE_PATH}`);
  }

  mkdirSync(join(cacheDir(), "island"), { recursive: true });
  if (!force && existsSync(BINARY_PATH) && statSync(BINARY_PATH).mtimeMs >= statSync(SOURCE_PATH).mtimeMs) {
    return BINARY_PATH;
  }

  const result = spawnSync("swiftc", [
    SOURCE_PATH,
    "-o",
    BINARY_PATH,
    "-framework",
    "AppKit"
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error || result.status !== 0) {
    throw new Error([
      "Failed to build cxstatusline island.",
      "Install Xcode Command Line Tools if swiftc is missing.",
      result.stderr || result.error?.message || ""
    ].filter(Boolean).join("\n"));
  }

  return BINARY_PATH;
}

function stopIsland() {
  const result = spawnSync("pkill", ["-f", BINARY_PATH], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status === 0) {
    console.log("island: stopped");
    return;
  }

  if (result.status === 1) {
    console.log("island: not running");
    return;
  }

  if (result.error) throw result.error;
  throw new Error(result.stderr || "Failed to stop cxstatusline island.");
}

function buildIslandEnv(flags) {
  const passthrough = renderPassthroughArgs(flags);
  return {
    ...process.env,
    CXSTATUSLINE_ISLAND_NODE: process.execPath,
    CXSTATUSLINE_ISLAND_SCRIPT: join(repoRoot, "bin", "cxstatusline.js"),
    CXSTATUSLINE_ISLAND_CWD: flags.cwd || process.cwd(),
    CXSTATUSLINE_ISLAND_REFRESH: String(flags.refresh || flags["refresh-interval"] || 1),
    CXSTATUSLINE_ISLAND_WIDTH: String(flags.width || 120),
    CXSTATUSLINE_ISLAND_ARGS: JSON.stringify(passthrough)
  };
}

function islandRenderConfig(flags) {
  let config = loadConfig({ config: flags.config });
  if (flags.theme) config.theme = flags.theme;
  if (flags.mode) config.mode = flags.mode;
  if (flags.minimal) config.minimal = true;
  if (flags.preset) config = applyPreset(config, flags.preset);
  if (flags.widgets) {
    config.widgets = String(flags.widgets).split(",").map((type) => ({ type: type.trim() })).filter((widget) => widget.type);
  }
  return config;
}

function islandDetail({ cwd, state, hookTrust }) {
  if (!hookTrust.trusted) return hookTrust.message;
  if (state.lastEvent === "PermissionRequest") return "Codex is waiting for an authorization decision.";
  return cwd;
}

function islandAlerts({ state, hookTrust }) {
  const alerts = [];
  if (!hookTrust.trusted) {
    alerts.push({
      id: `hooks:${hookTrust.status}:${hookTrust.missingRefs.join(",")}`,
      severity: "warning",
      title: "Authorize hooks",
      message: hookTrust.message,
      action: hookTrust.action
    });
  }

  if (state.lastEvent === "PermissionRequest") {
    alerts.push({
      id: `permission:${state.sessionId || "unknown"}:${state.lastPayloadAt || ""}`,
      severity: "danger",
      title: "Authorization needed",
      message: "Codex is waiting for approval in the terminal.",
      action: "Return to Codex and approve or deny the request."
    });
  }

  return alerts;
}

function islandSummary({ cwd, state, git, codexConfig, agent = "Codex", client = "Codex Terminal" }) {
  const transcript = readTranscriptSummary(state.transcriptPath);
  const usage = { ...(state.usage || {}) };
  const contextWindow = finiteNumber(usage.contextWindow) || finiteNumber(transcript.contextWindow);
  const contextUsed = finiteNumber(usage.contextUsed) || finiteNumber(transcript.contextUsed) || finiteNumber(transcript.lastTurnTokens);
  const contextPercent = finiteNumber(usage.contextUsagePercent) || percent(contextUsed, contextWindow);
  const title = truncateText(
    state.sessionName
      || transcript.lastUserMessage
      || transcript.lastAgentMessage
      || `${basename(cwd) || "Codex"} session`,
    72
  );
  const runState = state.runState || "Ready";
  const project = git.rootName || basename(cwd) || "project";
  const branch = git.branch || "";
  const model = state.model || codexConfig.model || process.env.CODEX_MODEL || "Codex";
  const tokens = finiteNumber(usage.totalTokens) || finiteNumber(transcript.lastTurnTokens) || finiteNumber(transcript.totalTokens);
  const inputTokens = finiteNumber(usage.inputTokens) || finiteNumber(transcript.inputTokens);
  const outputTokens = finiteNumber(usage.outputTokens) || finiteNumber(transcript.outputTokens);
  const elapsedMs = Date.now() - Date.parse(state.startedAt || state.lastPayloadAt || new Date().toISOString());
  const primaryLimitPercent = finiteNumber(usage.sessionUsagePercent) || finiteNumber(transcript.primaryLimitPercent);
  const weeklyLimitPercent = finiteNumber(usage.weeklyUsagePercent) || finiteNumber(transcript.secondaryLimitPercent);
  const lastTool = state.lastTool || transcript.lastTool || "";
  const subtitleParts = [
    runState,
    lastTool ? lastToolName(lastTool) : "",
    project,
    branch
  ].filter(Boolean);

  return {
    agent,
    client,
    title,
    subtitle: subtitleParts.join(" · "),
    project,
    branch,
    model,
    runState,
    lastEvent: state.lastEvent || "",
    lastTool: lastToolName(lastTool),
    permissionMode: state.permissionMode || "",
    cwd,
    sessionId: state.sessionId || "",
    elapsed: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? formatDuration(elapsedMs) : "",
    tokens: tokens ? compactNumber(tokens) : "",
    inputTokens: inputTokens ? compactNumber(inputTokens) : "",
    outputTokens: outputTokens ? compactNumber(outputTokens) : "",
    contextPercent,
    contextWindow: contextWindow ? compactNumber(contextWindow) : "",
    primaryLimitPercent,
    weeklyLimitPercent,
    preview: truncateText(transcript.lastAgentMessage || transcript.lastUserMessage || "", 120)
  };
}

function geminiSummary() {
  const latest = latestGeminiSession();
  if (!latest) return missingAgentSummary("Gemini", "Gemini CLI");
  const lines = readJsonLinesTail(latest.path, 900);
  const projectDir = dirname(dirname(latest.path));
  const projectRoot = readText(join(projectDir, ".project_root"), "").trim() || process.cwd();
  const output = {
    agent: "Gemini",
    client: "Gemini CLI",
    title: "",
    subtitle: "Ready",
    project: basename(projectRoot),
    branch: "",
    model: "",
    runState: "Ready",
    lastEvent: "",
    lastTool: "",
    permissionMode: "",
    cwd: projectRoot,
    sessionId: "",
    elapsed: "",
    tokens: "",
    inputTokens: "",
    outputTokens: "",
    contextPercent: null,
    contextWindow: "",
    primaryLimitPercent: null,
    weeklyLimitPercent: null,
    preview: ""
  };

  let startTime = null;
  let lastUpdated = latest.mtimeMs;
  for (const item of lines) {
    if (item.sessionId && item.startTime) {
      output.sessionId = item.sessionId;
      startTime ||= item.startTime;
      lastUpdated = Date.parse(item.lastUpdated || item.startTime) || lastUpdated;
    }
    if (item.$set?.lastUpdated) lastUpdated = Date.parse(item.$set.lastUpdated) || lastUpdated;
    if (item.type === "user") {
      const text = textFromGeminiContent(item.content);
      if (text) output.title = truncateText(text, 72);
    }
    if (item.type === "gemini") {
      output.model = item.model || output.model;
      output.preview = truncateText(item.content || output.preview, 120);
      if (item.tokens) {
        output.tokens = compactNumber(item.tokens.total);
        output.inputTokens = compactNumber(item.tokens.input);
        output.outputTokens = compactNumber(item.tokens.output);
      }
      const tool = lastGeminiTool(item.toolCalls);
      if (tool) output.lastTool = tool;
    }
  }

  output.title ||= `${output.project || "Gemini"} session`;
  output.elapsed = startTime ? formatDuration(Date.now() - Date.parse(startTime)) : "";
  output.runState = Date.now() - lastUpdated < 90_000 && output.lastTool ? "Working" : "Ready";
  output.subtitle = [output.runState, output.lastTool, output.project].filter(Boolean).join(" · ");
  return output;
}

function claudeSummary() {
  const latest = latestClaudeSession();
  if (!latest) return missingAgentSummary("Claude", "Claude Code");
  const lines = readJsonLinesTail(latest.path, 900);
  const output = {
    agent: "Claude",
    client: "Claude Code",
    title: "",
    subtitle: "Ready",
    project: "",
    branch: "",
    model: "",
    runState: "Ready",
    lastEvent: "",
    lastTool: "",
    permissionMode: "",
    cwd: process.cwd(),
    sessionId: "",
    elapsed: "",
    tokens: "",
    inputTokens: "",
    outputTokens: "",
    contextPercent: null,
    contextWindow: "",
    primaryLimitPercent: null,
    weeklyLimitPercent: null,
    preview: ""
  };

  let startTime = null;
  let lastUpdated = latest.mtimeMs;
  for (const item of lines) {
    if (item.cwd) {
      output.cwd = item.cwd;
      output.project = basename(item.cwd);
    }
    if (item.gitBranch) output.branch = item.gitBranch;
    if (item.sessionId) output.sessionId = item.sessionId;
    if (item.timestamp) {
      startTime ||= item.timestamp;
      lastUpdated = Date.parse(item.timestamp) || lastUpdated;
    }
    if (item.type === "last-prompt" && item.lastPrompt) output.title = truncateText(item.lastPrompt, 72);
    if (item.type === "ai-title" && !output.title) output.title = truncateText(item.aiTitle, 72);
    if (item.type === "permission-mode") output.permissionMode = item.permissionMode || output.permissionMode;
    if (item.type === "user") {
      const text = textFromClaudeContent(item.message?.content);
      if (text && !isClaudeToolResult(item.message?.content)) output.title = truncateText(text, 72);
    }
    if (item.type === "assistant" && item.message) {
      output.model = item.message.model || output.model;
      const text = textFromClaudeContent(item.message.content);
      if (text) output.preview = truncateText(text, 120);
      const tool = lastClaudeTool(item.message.content);
      if (tool) output.lastTool = tool;
      const usage = item.message.usage || {};
      const input = Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0) + Number(usage.cache_read_input_tokens || 0);
      const outputTokens = Number(usage.output_tokens || 0);
      const total = input + outputTokens;
      if (total > 0) {
        output.tokens = compactNumber(total);
        output.inputTokens = compactNumber(input);
        output.outputTokens = compactNumber(outputTokens);
      }
    }
  }

  output.title ||= `${output.project || "Claude"} session`;
  output.elapsed = startTime ? formatDuration(Date.now() - Date.parse(startTime)) : "";
  output.runState = Date.now() - lastUpdated < 90_000 && output.lastTool ? "Working" : "Ready";
  output.subtitle = [output.runState, output.lastTool, output.project].filter(Boolean).join(" · ");
  return output;
}

function missingAgentSummary(agent, client) {
  return {
    agent,
    client,
    title: `${agent} session not found`,
    subtitle: "No local transcript yet",
    project: "",
    branch: "",
    model: "",
    runState: "Idle",
    lastEvent: "",
    lastTool: "",
    permissionMode: "",
    cwd: process.cwd(),
    sessionId: "",
    elapsed: "",
    tokens: "",
    inputTokens: "",
    outputTokens: "",
    contextPercent: null,
    contextWindow: "",
    primaryLimitPercent: null,
    weeklyLimitPercent: null,
    preview: `Start ${client} once so cxstatusline can read its local transcript.`
  };
}

function readTranscriptSummary(path) {
  if (!path || !existsSync(path)) return {};
  const lines = readText(path, "").trim().split(/\r?\n/).slice(-700);
  const output = {};
  for (const line of lines) {
    if (!line.trim().startsWith("{")) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = item.payload || {};
    if (item.type === "event_msg" && payload.type === "user_message" && payload.message) {
      output.lastUserMessage = cleanTranscriptText(payload.message);
    }
    if (item.type === "event_msg" && payload.type === "task_complete" && payload.last_agent_message) {
      output.lastAgentMessage = cleanTranscriptText(payload.last_agent_message);
    }
    if (item.type === "event_msg" && payload.type === "agent_message" && payload.message) {
      output.lastAgentMessage = cleanTranscriptText(payload.message);
    }
    if (item.type === "event_msg" && payload.type === "token_count") {
      const total = payload.info?.total_token_usage || {};
      const last = payload.info?.last_token_usage || {};
      output.totalTokens = finiteNumber(total.total_tokens);
      output.lastTurnTokens = finiteNumber(last.total_tokens);
      output.inputTokens = finiteNumber(last.input_tokens);
      output.outputTokens = finiteNumber(last.output_tokens);
      output.contextWindow = finiteNumber(payload.info?.model_context_window);
      output.contextUsed = finiteNumber(last.total_tokens);
      output.primaryLimitPercent = finiteNumber(payload.rate_limits?.primary?.used_percent);
      output.secondaryLimitPercent = finiteNumber(payload.rate_limits?.secondary?.used_percent);
    }
    if (item.type === "response_item" && payload.type === "function_call") {
      output.lastTool = payload.name || output.lastTool;
    }
    if (item.type === "response_item" && payload.type === "message" && payload.role === "user") {
      const text = payload.content?.map((part) => part.text || "").join(" ").trim();
      if (text) output.lastUserMessage = cleanTranscriptText(text);
    }
  }
  return output;
}

function cleanTranscriptText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, width) {
  const text = cleanTranscriptText(value);
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function lastToolName(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function percent(used, total) {
  if (!used || !total) return null;
  const value = (Number(used) / Number(total)) * 100;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function latestGeminiSession() {
  return latestFileUnder(join(homePath(".gemini"), "tmp"), (path) => /\/chats\/[^/]+\.jsonl$/.test(path));
}

function latestClaudeSession() {
  return latestFileUnder(join(homePath(".claude"), "projects"), (path) => path.endsWith(".jsonl"));
}

function latestFileUnder(root, predicate) {
  if (!existsSync(root)) return null;
  let latest = null;
  const visit = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || !predicate(path)) continue;
      const stat = safeStat(path);
      if (stat && (!latest || stat.mtimeMs > latest.mtimeMs)) {
        latest = { path, mtimeMs: stat.mtimeMs };
      }
    }
  };
  visit(root);
  return latest;
}

function readJsonLinesTail(path, maxLines = 700) {
  return readText(path, "")
    .trim()
    .split(/\r?\n/)
    .slice(-maxLines)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function textFromGeminiContent(content) {
  if (typeof content === "string") return cleanTranscriptText(content);
  if (Array.isArray(content)) {
    return cleanTranscriptText(content.map((part) => part.text || "").filter(Boolean).join(" "));
  }
  return "";
}

function lastGeminiTool(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return "";
  const tool = toolCalls[toolCalls.length - 1];
  return lastToolName(tool.displayName || tool.name || "");
}

function textFromClaudeContent(content) {
  if (typeof content === "string") return cleanTranscriptText(content);
  if (Array.isArray(content)) {
    return cleanTranscriptText(content
      .filter((part) => part?.type === "text")
      .map((part) => part.text || "")
      .join(" "));
  }
  return "";
}

function isClaudeToolResult(content) {
  return Array.isArray(content) && content.some((part) => part?.type === "tool_result");
}

function lastClaudeTool(content) {
  if (!Array.isArray(content)) return "";
  const tool = [...content].reverse().find((part) => part?.type === "tool_use");
  return lastToolName(tool?.name || "");
}

export function getHookTrustStatus(options = {}) {
  const hookPath = options.hooksPath || hooksPath();
  const configPath = options.configPath || codexConfigPath();
  const hooks = readJson(hookPath, null);
  if (!hooks?.hooks) {
    return {
      status: "missing",
      trusted: false,
      total: 0,
      trustedCount: 0,
      missingRefs: [],
      message: "cxstatusline hooks are not installed.",
      action: "Run cxstatusline install hooks, then review /hooks in Codex."
    };
  }

  const refs = collectCxHookRefs(hooks, hookPath);
  if (refs.length === 0) {
    return {
      status: "missing",
      trusted: false,
      total: 0,
      trustedCount: 0,
      missingRefs: [],
      message: "cxstatusline hooks are missing from Codex.",
      action: "Run cxstatusline install hooks, then review /hooks in Codex."
    };
  }

  const trustedRefs = parseTrustedHookRefs(readText(configPath, ""));
  const missingRefs = refs.map((item) => item.ref).filter((ref) => !trustedRefs.has(ref));
  const trusted = missingRefs.length === 0;
  return {
    status: trusted ? "trusted" : "untrusted",
    trusted,
    total: refs.length,
    trustedCount: refs.length - missingRefs.length,
    missingRefs,
    message: trusted
      ? "cxstatusline hooks are trusted."
      : `Review ${missingRefs.length} cxstatusline hook${missingRefs.length === 1 ? "" : "s"} in Codex.`,
    action: trusted ? "" : "Open /hooks in Codex and approve the cxstatusline hooks."
  };
}

function collectCxHookRefs(config, hookPath) {
  const refs = [];
  const events = config.hooks || {};
  for (const event of Object.keys(events)) {
    const groups = Array.isArray(events[event]) ? events[event] : [];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const hooks = Array.isArray(groups[groupIndex]?.hooks) ? groups[groupIndex].hooks : [];
      for (let hookIndex = 0; hookIndex < hooks.length; hookIndex += 1) {
        if (!isCxHook(hooks[hookIndex])) continue;
        refs.push({
          event,
          ref: `${hookPath}:${codexHookEventName(event)}:${groupIndex}:${hookIndex}`
        });
      }
    }
  }
  return refs;
}

function parseTrustedHookRefs(text) {
  const refs = new Set();
  const sectionPattern = /^\[hooks\.state\."((?:\\.|[^"\\])+)"]$/;
  let current = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(sectionPattern);
    if (section) {
      current = unescapeTomlString(section[1]);
      continue;
    }
    if (/^\[[^\]]+]$/.test(line)) {
      current = null;
      continue;
    }
    if (current && /^trusted_hash\s*=/.test(line)) refs.add(current);
  }
  return refs;
}

function unescapeTomlString(value) {
  return String(value)
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function codexHookEventName(event) {
  const known = new Map(HOOK_EVENTS.map((name) => [name, name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()]));
  return known.get(event) || String(event).replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
}

function renderPassthroughArgs(flags) {
  const output = [];
  for (const key of ["agent", "config", "preset", "theme", "mode", "widgets", "minimal"]) {
    if (flags[key] === undefined) continue;
    if (flags[key] === true) output.push(`--${key}`);
    else output.push(`--${key}`, String(flags[key]));
  }
  return output;
}

function resolveIslandAgent(value) {
  const requested = String(value || "codex").toLowerCase();
  if (requested === "auto") return mostRecentAgent();
  if (["codex", "claude", "gemini"].includes(requested)) return requested;
  return "codex";
}

function mostRecentAgent() {
  const candidates = [
    { agent: "codex", time: safeStat(statePath())?.mtimeMs || 0 },
    { agent: "claude", time: latestClaudeSession()?.mtimeMs || 0 },
    { agent: "gemini", time: latestGeminiSession()?.mtimeMs || 0 }
  ];
  return candidates.sort((a, b) => b.time - a.time)[0]?.agent || "codex";
}

function renderExternalAgentIslandStatus(agent, flags = {}) {
  const summary = agent === "gemini" ? geminiSummary() : claudeSummary();
  const cwd = flags.cwd || summary.cwd || process.cwd();
  const git = getGitInfo(cwd);
  const withGit = {
    ...summary,
    project: summary.project || git.rootName || basename(cwd),
    branch: summary.branch || git.branch || "",
    cwd
  };

  return {
    segments: summarySegments(withGit),
    theme: "island",
    detail: cwd,
    alerts: [],
    hooks: {
      status: "not-applicable",
      trusted: true,
      total: 0,
      trustedCount: 0,
      missingRefs: [],
      message: `${withGit.agent} uses local transcript/log polling.`,
      action: ""
    },
    summary: withGit
  };
}

function summarySegments(summary) {
  return [
    { text: summary.agent, fg: "#020617", bg: agentColor(summary.agent) },
    { text: summary.model || summary.client || "CLI", fg: "#f8fafc", bg: "#334155" },
    { text: summary.project || "project", fg: "#052e16", bg: "#4ade80" },
    { text: summary.runState || "Ready", fg: "#f8fafc", bg: "#0ea5e9" }
  ].filter((segment) => segment.text);
}

function agentColor(agent) {
  const name = String(agent || "").toLowerCase();
  if (name === "gemini") return "#a78bfa";
  if (name === "claude") return "#fb923c";
  return "#38bdf8";
}
