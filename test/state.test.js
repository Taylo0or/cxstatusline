import test from "node:test";
import assert from "node:assert/strict";
import { extractUsage, updateSamples, updateStateFromHook } from "../src/state.js";

test("extracts token usage from nested payloads", () => {
  const usage = extractUsage({
    response: {
      usage: {
        input_tokens: 1000,
        output_tokens: 250,
        total_duration_ms: 8_100_000,
        extra_usage_enabled: false,
        extra_usage_utilization: 0.26
      }
    }
  });

  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 250);
  assert.equal(usage.totalTokens, 1250);
  assert.equal(usage.totalDurationMs, 8_100_000);
  assert.equal(usage.extraUsageEnabled, false);
  assert.equal(usage.extraUsageUtilization, 0.26);
});

test("extracts upstream-style usage reset, error, and extra usage fields", () => {
  const usage = extractUsage({
    usage: {
      session_reset_at: "2026-03-12T08:30:00.000Z",
      weekly_reset_at: "2026-03-15T08:30:00.000Z",
      weekly_sonnet_reset_at: "2026-03-16T08:30:00.000Z",
      weekly_opus_reset_at: "2026-03-17T08:30:00.000Z",
      extra_usage_limit: 400000,
      extra_usage_used: 106,
      error: "timeout"
    }
  });

  assert.equal(usage.sessionResetAt, "2026-03-12T08:30:00.000Z");
  assert.equal(usage.weeklyResetAt, "2026-03-15T08:30:00.000Z");
  assert.equal(usage.weeklySonnetResetAt, "2026-03-16T08:30:00.000Z");
  assert.equal(usage.weeklyOpusResetAt, "2026-03-17T08:30:00.000Z");
  assert.equal(usage.extraUsageLimit, 400000);
  assert.equal(usage.extraUsageUsed, 106);
  assert.equal(usage.error, "timeout");
});

test("extracts Claude status JSON context and rate limit fields", () => {
  const usage = extractUsage({
    context_window: {
      total_input_tokens: 50113,
      total_output_tokens: 10462,
      context_window_size: 1000000,
      current_usage: {
        input_tokens: 8500,
        output_tokens: 1200,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 2000
      },
      used_percentage: 8,
      remaining_percentage: 92
    },
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: 1774020000 },
      seven_day: { used_percentage: 15, resets_at: 1774540000 }
    }
  });

  assert.equal(usage.inputTokens, 50113);
  assert.equal(usage.outputTokens, 10462);
  assert.equal(usage.totalTokens, 60575);
  assert.equal(usage.contextWindow, 1000000);
  assert.equal(usage.contextUsed, 15500);
  assert.equal(usage.contextRemaining, 984500);
  assert.equal(usage.contextUsagePercent, 8);
  assert.equal(usage.sessionUsagePercent, 42);
  assert.equal(usage.sessionResetAt, "2026-03-20T15:20:00.000Z");
  assert.equal(usage.weeklyUsagePercent, 15);
  assert.equal(usage.weeklyResetAt, "2026-03-26T15:46:40.000Z");
});

test("updates run state from hook events", () => {
  const first = updateStateFromHook({
    hook_event_name: "SessionStart",
    session_id: "abc",
    cwd: "/tmp/project",
    model: "gpt-5.5"
  }, {});
  const second = updateStateFromHook({ hook_event_name: "UserPromptSubmit", session_id: "abc" }, first);

  assert.equal(first.runState, "Ready");
  assert.equal(second.runState, "Thinking");
  assert.equal(second.sessionId, "abc");
  assert.equal(second.eventCounts.UserPromptSubmit, 1);
});

test("updates state from object-form status JSON fields", () => {
  const next = updateStateFromHook({
    hook_event_name: "Status",
    session_id: "abc",
    model: { id: "claude-opus-4-6[1m]", display_name: "Opus 4.6 (1M context)" },
    workspace: { current_dir: "/tmp/project" },
    worktree: { name: "feature-wt", branch: "feature", original_branch: "main" },
    output_style: { name: "default" }
  }, {});

  assert.equal(next.model, "Opus 4.6 (1M context)");
  assert.equal(next.cwd, "/tmp/project");
  assert.deepEqual(next.worktree, {
    name: "feature-wt",
    path: null,
    branch: "feature",
    originalCwd: null,
    originalBranch: "main",
    original_branch: "main"
  });
  assert.equal(next.outputStyle, "default");
});


test("tracks token samples when usage changes", () => {
  const samples = updateSamples([], { totalTokens: 100 }, "2026-01-01T00:00:00.000Z");
  const same = updateSamples(samples, { totalTokens: 100 }, "2026-01-01T00:00:01.000Z");
  const changed = updateSamples(same, { totalTokens: 200 }, "2026-01-01T00:00:02.000Z");

  assert.equal(same.length, 1);
  assert.equal(changed.length, 2);
});

test("stores optional session metadata and skill invocations from hooks", () => {
  const next = updateStateFromHook({
    hook_event_name: "PreToolUse",
    session_id: "abc",
    thread_title: "Ship it",
    effort: { level: "high" },
    output_style: { name: "concise" },
    vim: { mode: "NORMAL" },
    voice_enabled: "on",
    remote_control_enabled: false,
    oauthAccount: { emailAddress: "dev@example.com" },
    tool_name: "Skill",
    tool_input: { name: "review-pr" }
  }, {});

  assert.equal(next.sessionName, "Ship it");
  assert.equal(next.outputStyle, "concise");
  assert.equal(next.reasoningEffort, "high");
  assert.equal(next.vimMode, "NORMAL");
  assert.equal(next.voiceStatus, true);
  assert.equal(next.remoteControlStatus, false);
  assert.equal(next.accountEmail, "dev@example.com");
  assert.equal(next.skills.lastSkill, "review-pr");
  assert.equal(next.skills.totalInvocations, 1);
  assert.deepEqual(next.skills.uniqueSkills, ["review-pr"]);
});
