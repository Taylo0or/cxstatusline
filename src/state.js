import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, ensureDir, nowIso, readJson, writeJsonAtomic } from "./util.js";

export function statePath() {
  return join(cacheDir(), "state.json");
}

export function sessionStatePath(sessionId) {
  const safe = String(sessionId || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_");
  return join(cacheDir(), "sessions", `${safe}.json`);
}

export function loadState() {
  return readJson(statePath(), {});
}

export function saveState(state) {
  writeJsonAtomic(statePath(), state);
  if (state.sessionId) writeJsonAtomic(sessionStatePath(state.sessionId), state);
}

export async function readHookPayload(argv = process.argv.slice(2), stdin = process.stdin) {
  const inline = argv.find((arg) => String(arg).trim().startsWith("{"));
  if (inline) return JSON.parse(inline);

  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function updateStateFromHook(payload, previous = loadState()) {
  const now = nowIso();
  const event = payload.hook_event_name || payload.hookEventName || "Unknown";
  const sessionId = payload.session_id || payload.sessionId || previous.sessionId || null;
  const usage = extractUsage(payload);
  const transcriptUsage = payload.transcript_path ? extractUsageFromTranscript(payload.transcript_path) : {};
  const skillName = extractSkillName(payload);
  const eventCounts = { ...(previous.eventCounts || {}) };
  eventCounts[event] = (eventCounts[event] || 0) + 1;

  const next = {
    ...previous,
    sessionId,
    cwd: payload.cwd || payload.workspace?.current_dir || previous.cwd || process.cwd(),
    model: firstString(extractModel(payload), previous.model),
    reasoningEffort: firstString(
      payload.effort?.level,
      payload.effort_level,
      payload.effortLevel,
      payload.reasoning_effort,
      payload.reasoningEffort,
      payload.model_reasoning_effort,
      payload.modelReasoningEffort,
      previous.reasoningEffort
    ),
    permissionMode: payload.permission_mode || previous.permissionMode || null,
    lastEvent: event,
    lastPayloadAt: now,
    updatedAt: now,
    startedAt: previous.startedAt || now,
    turnId: payload.turn_id || payload.turnId || previous.turnId || null,
    transcriptPath: payload.transcript_path || previous.transcriptPath || null,
    worktree: Object.hasOwn(payload, "worktree") ? extractWorktree(payload) : previous.worktree || null,
    eventCounts,
    usage: { ...(previous.usage || {}), ...transcriptUsage, ...usage },
    version: firstString(payload.version, payload.codex_version, payload.codexVersion, payload.app_version, payload.appVersion, previous.version),
    sessionName: firstString(
      payload.session_name,
      payload.sessionName,
      payload.thread_title,
      payload.threadTitle,
      payload.conversation_title,
      payload.conversationTitle,
      payload.customTitle,
      previous.sessionName
    ),
    outputStyle: extractOutputStyle(payload) || previous.outputStyle || null,
    vimMode: firstString(payload.vim?.mode, payload.vim_mode, payload.vimMode, previous.vimMode),
    voiceStatus: firstBoolean(payload.voice?.enabled, payload.voice_enabled, payload.voiceEnabled, payload.voiceStatus, previous.voiceStatus),
    remoteControlStatus: firstBoolean(
      payload.remote_control?.enabled,
      payload.remoteControl?.enabled,
      payload.remote_control_enabled,
      payload.remoteControlEnabled,
      payload.remoteControlStatus,
      previous.remoteControlStatus
    ),
    accountEmail: firstString(
      payload.account_email,
      payload.accountEmail,
      payload.oauthAccount?.emailAddress,
      payload.user?.email,
      previous.accountEmail
    ),
    skills: updateSkills(previous.skills || {}, skillName)
  };
  next.samples = updateSamples(previous.samples || [], next.usage, now);

  if (event === "SessionStart") {
    next.startedAt = now;
    next.runState = "Ready";
  } else if (event === "UserPromptSubmit") {
    next.lastPromptAt = now;
    next.runState = "Thinking";
  } else if (event === "PreToolUse" || event === "PermissionRequest") {
    next.runState = "Working";
    next.lastTool = payload.tool_name || payload.toolName || payload.tool || previous.lastTool || null;
  } else if (event === "PostToolUse") {
    next.runState = "Thinking";
    next.lastTool = payload.tool_name || payload.toolName || payload.tool || previous.lastTool || null;
  } else if (event === "PreCompact" || event === "PostCompact") {
    next.compactions = Number(previous.compactions || 0) + (event === "PostCompact" ? 1 : 0);
    next.runState = "Compacting";
  } else if (event === "Stop" || event === "SubagentStop") {
    next.runState = "Ready";
  } else if (!next.runState) {
    next.runState = "Ready";
  }

  return next;
}

export function updateSamples(samples, usage, timestamp) {
  const totalTokens = Number(usage?.totalTokens || 0);
  const next = Array.isArray(samples) ? samples.slice(-120) : [];
  if (!totalTokens) return next;
  const last = next[next.length - 1];
  if (!last || last.totalTokens !== totalTokens) {
    next.push({
      at: timestamp,
      totalTokens,
      inputTokens: Number(usage?.inputTokens || 0),
      outputTokens: Number(usage?.outputTokens || 0)
    });
  }
  return next.slice(-120);
}

export function extractUsage(value) {
  const output = {};
  visit(value, (key, candidate) => {
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    const boolean = parseBooleanValue(candidate);
    if (normalized === "extrausageenabled" && boolean !== null) output.extraUsageEnabled = boolean;
    const string = typeof candidate === "string" ? candidate.trim() : "";
    if (string) {
      if (["sessionresetat", "fivehourresetat", "resetsat"].includes(normalized)) output.sessionResetAt = string;
      if (["weeklyresetat", "sevendayresetat"].includes(normalized)) output.weeklyResetAt = string;
      if (["weeklysonnetresetat", "sonnetweeklyresetat", "sevendaysonnetresetat"].includes(normalized)) output.weeklySonnetResetAt = string;
      if (["weeklyopusresetat", "opusweeklyresetat", "sevendayopusresetat"].includes(normalized)) output.weeklyOpusResetAt = string;
      if (["usageerror", "error"].includes(normalized) && isUsageError(string)) output.error = string;
    }

    const number = Number(candidate);
    if (!Number.isFinite(number)) return;

    if (["inputtokens", "totalinputtokens", "prompttokens"].includes(normalized)) output.inputTokens = number;
    if (["outputtokens", "totaloutputtokens", "completiontokens"].includes(normalized)) output.outputTokens = number;
    if (["cachedtokens", "tokencached", "cachetokens", "promptcachedtokens"].includes(normalized)) output.cachedTokens = number;
    if (["readtokens", "cachecreationinputtokens", "cachewritetokens"].includes(normalized)) output.cacheWriteTokens = number;
    if (["cacheReadInputTokens", "cachereadtokens", "cachereadinputtokens"].map((item) => item.toLowerCase()).includes(normalized)) output.cacheReadTokens = number;
    if (["totaltokens", "usedtokens", "tokencount"].includes(normalized)) output.totalTokens = number;
    if (["contextwindow", "contextwindowsize"].includes(normalized)) output.contextWindow = number;
    if (["contextused", "contextusedtokens"].includes(normalized)) output.contextUsed = number;
    if (["contextremaining", "contextremainingtokens"].includes(normalized)) output.contextRemaining = number;
    if (["costusd", "totalcostusd"].includes(normalized)) output.costUsd = number;
    if (["totaldurationms", "durationms", "sessiondurationms"].includes(normalized)) output.totalDurationMs = number;
    if (["usagelimit", "usagelimitremaining", "fivehourlimitremaining"].includes(normalized)) output.usageLimitRemaining = number;
    if (["usagelimitused", "fivehourlimitused"].includes(normalized)) output.usageLimitUsed = number;
    if (["extrausagelimit", "extrausagelimitcents"].includes(normalized)) output.extraUsageLimit = number;
    if (["extrausageremaining", "extrausageremainingdollars"].includes(normalized)) output.extraUsageRemaining = number;
    if (["extrausageused", "extrausageutilized"].includes(normalized)) output.extraUsageUsed = number;
    if (["extrausageutilization", "extrausageutilizationpercent", "extrausagepercent"].includes(normalized)) output.extraUsageUtilization = number;
    if (["sessionusage", "sessionusagepercent", "dailyusage", "dailyusagepercent"].includes(normalized)) output.sessionUsagePercent = number;
    if (["weeklyusage", "weeklyusagepercent"].includes(normalized)) output.weeklyUsagePercent = number;
    if (["weeklyusageused", "weeklylimitused"].includes(normalized)) output.weeklyUsageUsed = number;
    if (["weeklyusageremaining", "weeklylimitremaining"].includes(normalized)) output.weeklyUsageRemaining = number;
    if (["weeklysonnetusage", "weeklysonnetusagepercent", "sonnetweeklyusage"].includes(normalized)) output.weeklySonnetUsagePercent = number;
    if (["weeklysonnetusageused", "sonnetweeklyusageused"].includes(normalized)) output.weeklySonnetUsageUsed = number;
    if (["weeklysonnetusageremaining", "sonnetweeklyusageremaining"].includes(normalized)) output.weeklySonnetUsageRemaining = number;
    if (["weeklyopususage", "weeklyopususagepercent", "opusweeklyusage"].includes(normalized)) output.weeklyOpusUsagePercent = number;
    if (["weeklyopususageused", "opusweeklyusageused"].includes(normalized)) output.weeklyOpusUsageUsed = number;
    if (["weeklyopususageremaining", "opusweeklyusageremaining"].includes(normalized)) output.weeklyOpusUsageRemaining = number;
  });

  Object.assign(output, extractStructuredStatusUsage(value));

  if (!output.totalTokens && (output.inputTokens || output.outputTokens)) {
    output.totalTokens = Number(output.inputTokens || 0) + Number(output.outputTokens || 0);
  }
  if (!output.contextRemaining && output.contextWindow && output.contextUsed) {
    output.contextRemaining = output.contextWindow - output.contextUsed;
  }
  return output;
}

function isUsageError(value) {
  return ["no-credentials", "timeout", "rate-limited", "api-error", "parse-error"].includes(value);
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "enabled"].includes(text)) return true;
    if (["false", "0", "no", "off", "disabled"].includes(text)) return false;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(true|false|on|off|enabled|disabled)$/i.test(value.trim())) {
      return /^(true|on|enabled)$/i.test(value.trim());
    }
  }
  return null;
}

function extractOutputStyle(payload) {
  return firstString(
    payload.output_style?.name,
    payload.outputStyle?.name,
    payload.output_style,
    payload.outputStyle
  );
}

function extractModel(payload) {
  const model = payload.model;
  if (typeof model === "string") return model;
  if (model && typeof model === "object") {
    return firstString(model.display_name, model.displayName, model.name, model.id);
  }
  return null;
}

function extractWorktree(payload) {
  if (!payload.worktree || typeof payload.worktree !== "object" || Array.isArray(payload.worktree)) return null;
  return {
    name: firstString(payload.worktree.name),
    path: firstString(payload.worktree.path),
    branch: firstString(payload.worktree.branch),
    originalCwd: firstString(payload.worktree.original_cwd, payload.worktree.originalCwd),
    originalBranch: firstString(payload.worktree.original_branch, payload.worktree.originalBranch),
    original_branch: firstString(payload.worktree.original_branch, payload.worktree.originalBranch)
  };
}

function extractSkillName(payload) {
  const toolName = firstString(payload.tool_name, payload.toolName, payload.tool);
  const explicit = firstString(
    payload.skill?.name,
    payload.skill_name,
    payload.skillName,
    payload.tool_input?.skill,
    payload.tool_input?.name,
    payload.toolInput?.skill,
    payload.toolInput?.name
  );
  if (explicit && (!toolName || /^skill$/i.test(toolName))) return explicit;
  return null;
}

function updateSkills(previous, skillName) {
  const uniqueSkills = Array.isArray(previous.uniqueSkills) ? previous.uniqueSkills.slice() : [];
  const totalInvocations = Number(previous.totalInvocations || 0);
  if (!skillName) return { ...previous, uniqueSkills, totalInvocations };
  const nextUnique = uniqueSkills.filter((skill) => skill !== skillName);
  nextUnique.unshift(skillName);
  return {
    lastSkill: skillName,
    totalInvocations: totalInvocations + 1,
    uniqueSkills: nextUnique.slice(0, 50)
  };
}

function visit(value, callback, seen = new Set()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback, seen);
    return;
  }
  for (const [key, candidate] of Object.entries(value)) {
    callback(key, candidate);
    visit(candidate, callback, seen);
  }
}

export function extractUsageFromTranscript(path, maxLines = 300) {
  if (!path || !existsSync(path)) return {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const lines = raw.trim().split(/\r?\n/).slice(-maxLines);
  const merged = {};
  for (const line of lines) {
    if (!line.trim().startsWith("{")) continue;
    try {
      Object.assign(merged, extractUsage(JSON.parse(line)));
    } catch {
      // Transcript formats are intentionally best-effort.
    }
  }
  return merged;
}

function extractStructuredStatusUsage(value) {
  if (!value || typeof value !== "object") return {};
  const output = {};
  const context = value.context_window || value.contextWindow;
  if (context && typeof context === "object") {
    const window = finiteNumber(context.context_window_size ?? context.contextWindowSize);
    if (window !== null) output.contextWindow = window;

    const usedPercent = finiteNumber(context.used_percentage ?? context.usedPercentage);
    if (usedPercent !== null) output.contextUsagePercent = usedPercent;

    const currentUsage = currentContextTokens(context.current_usage ?? context.currentUsage);
    if (currentUsage !== null) output.contextUsed = currentUsage;
    else {
      if (window !== null && usedPercent !== null) output.contextUsed = Math.round((window * usedPercent) / 100);
    }

    const remainingPercent = finiteNumber(context.remaining_percentage ?? context.remainingPercentage);
    if (window !== null && output.contextUsed !== undefined) output.contextRemaining = window - output.contextUsed;
    else if (window !== null && remainingPercent !== null) output.contextRemaining = Math.round((window * remainingPercent) / 100);

    const inputTokens = finiteNumber(context.total_input_tokens ?? context.totalInputTokens);
    const outputTokens = finiteNumber(context.total_output_tokens ?? context.totalOutputTokens);
    if (inputTokens !== null) output.inputTokens = inputTokens;
    if (outputTokens !== null) output.outputTokens = outputTokens;
    if (inputTokens !== null || outputTokens !== null) {
      output.totalTokens = Number(inputTokens || 0) + Number(outputTokens || 0);
    }
  }

  const rateLimits = value.rate_limits || value.rateLimits;
  if (rateLimits && typeof rateLimits === "object") {
    applyRateLimit(output, rateLimits.five_hour || rateLimits.fiveHour, "sessionUsagePercent", "sessionResetAt");
    applyRateLimit(output, rateLimits.seven_day || rateLimits.sevenDay, "weeklyUsagePercent", "weeklyResetAt");
    applyRateLimit(output, rateLimits.seven_day_sonnet || rateLimits.sevenDaySonnet, "weeklySonnetUsagePercent", "weeklySonnetResetAt");
    applyRateLimit(output, rateLimits.seven_day_opus || rateLimits.sevenDayOpus, "weeklyOpusUsagePercent", "weeklyOpusResetAt");
  }

  return output;
}

function currentContextTokens(value) {
  const direct = finiteNumber(value);
  if (direct !== null) return direct;
  if (!value || typeof value !== "object") return null;
  const keys = [
    "input_tokens",
    "inputTokens",
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
    "cache_read_input_tokens",
    "cacheReadInputTokens"
  ];
  let total = 0;
  for (const key of keys) total += Number(finiteNumber(value[key]) || 0);
  return total > 0 ? total : null;
}

function applyRateLimit(output, bucket, percentKey, resetKey) {
  if (!bucket || typeof bucket !== "object") return;
  const percent = finiteNumber(bucket.used_percentage ?? bucket.usedPercentage);
  if (percent !== null) output[percentKey] = percent;
  const reset = epochToIso(bucket.resets_at ?? bucket.resetsAt);
  if (reset) output[resetKey] = reset;
}

function epochToIso(value) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const ms = number > 1_000_000_000_000 ? number : number * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function resetState() {
  ensureDir(cacheDir());
  const state = { resetAt: nowIso(), runState: "Ready" };
  saveState(state);
  return state;
}
