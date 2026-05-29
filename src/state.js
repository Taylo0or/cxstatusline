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
    usage: { ...(previous.usage || {}), ...transcriptUsage, ...usage }
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
  });

  if (!output.totalTokens && (output.inputTokens || output.outputTokens)) {
    output.totalTokens = Number(output.inputTokens || 0) + Number(output.outputTokens || 0);
  }
  if (!output.contextRemaining && output.contextWindow && output.contextUsed) {
    output.contextRemaining = output.contextWindow - output.contextUsed;
  }
  return output;
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
