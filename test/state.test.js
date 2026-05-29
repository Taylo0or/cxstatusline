import test from "node:test";
import assert from "node:assert/strict";
import { extractUsage, updateSamples, updateStateFromHook } from "../src/state.js";

test("extracts token usage from nested payloads", () => {
  const usage = extractUsage({
    response: {
      usage: {
        input_tokens: 1000,
        output_tokens: 250
      }
    }
  });

  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 250);
  assert.equal(usage.totalTokens, 1250);
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

test("tracks token samples when usage changes", () => {
  const samples = updateSamples([], { totalTokens: 100 }, "2026-01-01T00:00:00.000Z");
  const same = updateSamples(samples, { totalTokens: 100 }, "2026-01-01T00:00:01.000Z");
  const changed = updateSamples(same, { totalTokens: 200 }, "2026-01-01T00:00:02.000Z");

  assert.equal(same.length, 1);
  assert.equal(changed.length, 2);
});
