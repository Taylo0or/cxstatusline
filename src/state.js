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
    cwd: payload.cwd || previous.cwd || process.cwd(),
    model: payload.model || previous.model || null,
    permissionMode: payload.permission_mode || previous.permissionMode || null,
    lastEvent: event,
    lastPayloadAt: now,
    updatedAt: now,
    startedAt: previous.startedAt || now,
    turnId: payload.turn_id || payload.turnId || previous.turnId || null,
    transcriptPath: payload.transcript_path || previous.transcriptPath || null,
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
    if (["usagelimit", "usagelimitremaining", "fivehourlimitremaining"].includes(normalized)) output.usageLimitRemaining = number;
    if (["usagelimitused", "fivehourlimitused"].includes(normalized)) output.usageLimitUsed = number;
    if (["extrausagelimit", "extrausageremaining"].includes(normalized)) output.extraUsageRemaining = number;
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

  if (!output.totalTokens && (output.inputTokens || output.outputTokens)) {
    output.totalTokens = Number(output.inputTokens || 0) + Number(output.outputTokens || 0);
  }
  if (!output.contextRemaining && output.contextWindow && output.contextUsed) {
    output.contextRemaining = output.contextWindow - output.contextUsed;
  }
  return output;
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

export function resetState() {
  ensureDir(cacheDir());
  const state = { resetAt: nowIso(), runState: "Ready" };
  saveState(state);
  return state;
}
