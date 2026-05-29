import test from "node:test";
import assert from "node:assert/strict";
import { parseSimpleToml, upsertNativeStatusLine } from "../src/codexConfig.js";

test("parses simple Codex config values", () => {
  const parsed = parseSimpleToml(`model = "gpt-5.5"
service_tier = "fast"

[tui]
status_line = ["model", "git-branch"]
status_line_use_colors = true
`);

  assert.equal(parsed.model, "gpt-5.5");
  assert.equal(parsed.tui.status_line_use_colors, true);
  assert.deepEqual(parsed.tui.status_line, ["model", "git-branch"]);
});

test("adds a native status line section", () => {
  const output = upsertNativeStatusLine('model = "gpt-5.5"\n', ["model", "run-state"], true);
  assert.match(output, /\[tui]/);
  assert.match(output, /status_line = \["model", "run-state"]/);
});

test("replaces an existing native status line", () => {
  const output = upsertNativeStatusLine(`[tui]
status_line = ["old"]
status_line_use_colors = false

[features]
hooks = true
`, ["model"], true);

  assert.match(output, /status_line = \["model"]/);
  assert.doesNotMatch(output, /old/);
  assert.match(output, /\[features]/);
});
