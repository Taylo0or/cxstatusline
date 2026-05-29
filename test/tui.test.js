import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWidgetForType,
  describeWidget,
  getConfigLines,
  moveWidget,
  sanitizePreviewConfig,
  setConfigLines
} from "../src/tui.js";
import { DEFAULT_CONFIG } from "../src/constants.js";

test("TUI line helpers preserve single-line and multi-line config shapes", () => {
  const single = setConfigLines(DEFAULT_CONFIG, [[{ type: "model" }, { type: "runState" }]]);
  assert.deepEqual(single.widgets, [{ type: "model" }, { type: "runState" }]);
  assert.equal(single.lines, undefined);

  const multi = setConfigLines(DEFAULT_CONFIG, [[{ type: "model" }], [{ type: "gitBranch" }]]);
  assert.equal(multi.widgets, undefined);
  assert.deepEqual(getConfigLines(multi), [[{ type: "model" }], [{ type: "gitBranch" }]]);
});

test("TUI widget movement wraps at line boundaries", () => {
  const line = [{ type: "model" }, { type: "gitBranch" }, { type: "runState" }];

  const movedUp = moveWidget(line, 0, -1);
  assert.equal(movedUp.index, 2);
  assert.deepEqual(movedUp.line, [{ type: "gitBranch" }, { type: "runState" }, { type: "model" }]);

  const movedDown = moveWidget(line, 2, 1);
  assert.equal(movedDown.index, 0);
  assert.deepEqual(movedDown.line, [{ type: "runState" }, { type: "model" }, { type: "gitBranch" }]);
});

test("TUI default widgets include editable metadata for custom widgets", () => {
  assert.deepEqual(defaultWidgetForType("custom-command"), {
    type: "command",
    command: "printf ok",
    timeout: 1000,
    maxWidth: 40
  });
  assert.deepEqual(defaultWidgetForType("link"), {
    type: "link",
    href: "https://example.com",
    text: "link"
  });
});

test("TUI preview sanitizes command widgets to avoid executing shell commands", () => {
  const config = {
    ...DEFAULT_CONFIG,
    widgets: [{ type: "command", command: "touch /tmp/should-not-run", label: "Cmd", maxWidth: 12 }]
  };
  const preview = sanitizePreviewConfig(config);

  assert.equal(preview.widgets[0].type, "text");
  assert.equal(preview.widgets[0].text, "$ touch /tmp/should-not-run");
  assert.equal(preview.widgets[0].label, "Cmd");
  assert.equal(preview.widgets[0].maxWidth, 12);
});

test("TUI widget descriptions expose common editor modifiers", () => {
  assert.equal(
    describeWidget({ type: "command", command: "printf ok", label: "", merge: "no-padding", bold: true, maxWidth: 8, timeout: 500 }),
    "command (raw, cmd=printf ok, merge=no-padding, bold, max=8, timeout=500)"
  );
});
