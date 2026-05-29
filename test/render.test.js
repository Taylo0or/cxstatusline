import test from "node:test";
import assert from "node:assert/strict";
import { renderStatusLine } from "../src/render.js";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { applyPreset } from "../src/config.js";
import { stripAnsi, visibleLength } from "../src/util.js";

test("renders a plain status line from configured widgets", () => {
  const output = renderStatusLine({
    config: { ...DEFAULT_CONFIG, mode: "plain", widgets: [{ type: "model", label: "Model" }, { type: "runState", label: "" }] },
    state: { model: "gpt-5.5", runState: "Ready" },
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "Model: gpt-5.5 | Ready");
});

test("renders colored powerline output with visible text", () => {
  const output = renderStatusLine({
    config: { ...DEFAULT_CONFIG, widgets: [{ type: "model", label: "Model" }] },
    state: { model: "gpt-5.5" },
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.match(output, /\x1b\[38;2;/);
  assert.match(stripAnsi(output), /Model: gpt-5.5/);
});

test("respects width truncation in visible cells", () => {
  const output = renderStatusLine({
    config: { ...DEFAULT_CONFIG, mode: "plain", widgets: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }] },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain", width: 10 });

  assert.ok(visibleLength(output) <= 10);
});

test("renders multiple configured lines", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      lines: [
        [{ type: "model", label: "" }],
        [{ type: "runState", label: "" }]
      ]
    },
    state: { model: "gpt-5.5", runState: "Ready" },
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "gpt-5.5\nReady");
});

test("renders preset configurations", () => {
  const config = applyPreset({ ...DEFAULT_CONFIG, mode: "plain" }, "compact");
  const output = renderStatusLine({
    config,
    state: { model: "gpt-5.5", runState: "Ready" },
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.match(output, /gpt-5.5/);
  assert.match(output, /Ready/);
});

test("supports plain right alignment with spacer", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      widgets: [{ type: "text", text: "left" }, { type: "spacer" }, { type: "text", text: "right" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain", width: 20 });

  assert.equal(output, "left           right");
});

test("supports per-widget color overrides", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      widgets: [{ type: "text", text: "hot", fg: "#010203", bg: "#040506" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.match(output, /\x1b\[48;2;4;5;6m/);
  assert.match(output, /\x1b\[38;2;1;2;3m/);
});

test("supports custom powerline separators and caps", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separator: ">", startCap: "<", endCap: "!" },
      widgets: [{ type: "text", text: "a" }, { type: "text", text: "b" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { color: false });

  assert.equal(output, "< a   b !");
});
