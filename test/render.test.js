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
    cwd: process.cwd(),
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

test("supports ccstatusline width env alias", () => {
  const previousCx = process.env.CXSTATUSLINE_WIDTH;
  const previousCc = process.env.CCSTATUSLINE_WIDTH;
  delete process.env.CXSTATUSLINE_WIDTH;
  process.env.CCSTATUSLINE_WIDTH = "8";
  try {
    const output = renderStatusLine({
      config: { ...DEFAULT_CONFIG, mode: "plain", widgets: [{ type: "text", text: "abcdefghijklmnop" }] },
      state: {},
      git: { isRepo: false },
      cwd: "/tmp/project",
      codexConfig: {}
    }, { format: "plain" });

    assert.ok(visibleLength(output) <= 8);
  } finally {
    if (previousCx === undefined) delete process.env.CXSTATUSLINE_WIDTH;
    else process.env.CXSTATUSLINE_WIDTH = previousCx;
    if (previousCc === undefined) delete process.env.CCSTATUSLINE_WIDTH;
    else process.env.CCSTATUSLINE_WIDTH = previousCc;
  }
});

test("supports ccstatusline flex width modes", () => {
  const previousColumns = process.env.COLUMNS;
  process.env.COLUMNS = "50";
  try {
    const compact = renderStatusLine({
      config: {
        ...DEFAULT_CONFIG,
        mode: "plain",
        flexMode: "full-minus-40",
        widgets: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }]
      },
      state: {},
      git: { isRepo: false },
      cwd: "/tmp/project",
      codexConfig: {}
    }, { format: "plain" });

    assert.equal(visibleLength(compact), 10);
    assert.match(compact, /\.\.\./);
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = previousColumns;
  }
});

test("supports full-until-compact width thresholds", () => {
  const previousColumns = process.env.COLUMNS;
  process.env.COLUMNS = "50";
  try {
    const under = renderStatusLine({
      config: {
        ...DEFAULT_CONFIG,
        mode: "plain",
        flexMode: "full-until-compact",
        compactThreshold: 60,
        widgets: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }]
      },
      state: { usage: { contextUsed: 20, contextWindow: 100 } },
      git: { isRepo: false },
      cwd: "/tmp/project",
      codexConfig: {}
    }, { format: "plain" });

    const over = renderStatusLine({
      config: {
        ...DEFAULT_CONFIG,
        mode: "plain",
        flexMode: "full-until-compact",
        compactThreshold: 60,
        widgets: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }]
      },
      state: { usage: { contextUsed: 80, contextWindow: 100 } },
      git: { isRepo: false },
      cwd: "/tmp/project",
      codexConfig: {}
    }, { format: "plain" });

    assert.equal(under, "abcdefghijklmnopqrstuvwxyz");
    assert.equal(visibleLength(over), 10);
    assert.match(over, /\.\.\./);
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = previousColumns;
  }
});

test("keeps explicit width ahead of flex width modes", () => {
  const previousColumns = process.env.COLUMNS;
  process.env.COLUMNS = "50";
  try {
    const output = renderStatusLine({
      config: {
        ...DEFAULT_CONFIG,
        mode: "plain",
        flexMode: "full-minus-40",
        widgets: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }]
      },
      state: {},
      git: { isRepo: false },
      cwd: "/tmp/project",
      codexConfig: {}
    }, { format: "plain", width: 20 });

    assert.equal(visibleLength(output), 20);
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = previousColumns;
  }
});

test("supports multiple powerline caps and Unicode codepoint caps", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separator: "U+003E", startCaps: ["<", "["], endCaps: ["]", "U+0021"] },
      widgets: [{ type: "text", text: "a" }, { type: "text", text: "b" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { color: false });

  assert.equal(output, "<[ a   b ]!");
});

test("supports multiple powerline separators", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separators: [">", "*"], endCap: "!" },
      widgets: [{ type: "text", text: "a" }, { type: "text", text: "b" }, { type: "text", text: "c" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.equal(stripAnsi(output), " a > b * c !");
});

test("supports inverted powerline separator backgrounds", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separators: [">"], separatorInvertBackground: [true] },
      widgets: [{ type: "text", text: "a" }, { type: "text", text: "b" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.match(output, /\x1b\[48;2;56;189;248m\x1b\[38;2;74;222;128m>/);
});

test("supports powerline merge mode without separators", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separator: ">", endCap: "!" },
      widgets: [
        { type: "text", text: "a", merge: true },
        { type: "text", text: "b" },
        { type: "text", text: "c" }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.equal(stripAnsi(output), " a  b > c !");
});

test("supports powerline no-padding merge mode", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      powerline: { separator: ">", endCap: "!" },
      widgets: [
        { type: "text", text: "a", merge: "no-padding" },
        { type: "text", text: "b" }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  assert.equal(stripAnsi(output), " ab !");
});

test("collapses manual separators around empty widgets", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      widgets: [
        { type: "separator", text: " :: " },
        { type: "text", text: "left" },
        { type: "separator", text: " :: " },
        { type: "text", text: "" },
        { type: "separator", text: " :: " },
        { type: "text", text: "right" },
        { type: "separator", text: " :: " }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "left :: right");
});

test("uses manual separators without adding automatic plain separators", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      widgets: [
        { type: "text", text: "left" },
        { type: "separator", text: " <> " },
        { type: "text", text: "right" }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "left <> right");
});

test("supports default plain padding and separators", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      defaultPadding: "_",
      defaultSeparator: "·",
      widgets: [{ type: "text", text: "left" }, { type: "text", text: "right" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "_left_·_right_");
});

test("supports plain global color and bold overrides", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      globalBold: true,
      overrideForegroundColor: "#010203",
      overrideBackgroundColor: "#040506",
      widgets: [{ type: "text", text: "hot" }]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "ansi" });

  assert.equal(stripAnsi(output), "hot");
  assert.match(output, /\x1b\[1m\x1b\[48;2;4;5;6m\x1b\[38;2;1;2;3mhot\x1b\[0m/);
});

test("supports inherited plain separator colors", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      defaultSeparator: "|",
      inheritSeparatorColors: true,
      widgets: [
        { type: "text", text: "a", fg: "#010203", bg: "#040506" },
        { type: "text", text: "b", fg: "#070809" }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "ansi" });

  assert.equal(stripAnsi(output), "a|b");
  assert.match(output, /\x1b\[48;2;4;5;6m\x1b\[38;2;1;2;3m\|/);
});

test("supports no-padding merge in plain rendering", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "plain",
      defaultPadding: "_",
      defaultSeparator: "|",
      widgets: [
        { type: "text", text: "a", merge: "no-padding" },
        { type: "text", text: "b" }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { format: "plain" });

  assert.equal(output, "_ab_");
});

test("preserves custom command ANSI colors when requested", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      widgets: [
        { type: "command", command: "printf '\\033[31mhot\\033[0m'", preserveColors: true }
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: process.cwd(),
    codexConfig: {}
  });

  assert.match(output, /\x1b\[31mhot\x1b\[0m/);
});

test("supports powerline auto-align across multiple lines", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "powerline",
      powerline: { autoAlign: true },
      lines: [
        [{ type: "text", text: "a" }, { type: "text", text: "yy" }],
        [{ type: "text", text: "long" }, { type: "text", text: "zz" }]
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  }, { color: false });

  const [first, second] = output.split("\n");
  assert.equal(first.indexOf("yy"), second.indexOf("zz"));
});

test("supports powerline theme continuation across multiple lines", () => {
  const output = renderStatusLine({
    config: {
      ...DEFAULT_CONFIG,
      mode: "powerline",
      powerline: { continueThemeAcrossLines: true },
      lines: [
        [{ type: "text", text: "a" }, { type: "text", text: "b" }],
        [{ type: "text", text: "c" }]
      ]
    },
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/project",
    codexConfig: {}
  });

  const [first, second] = output.split("\n");
  assert.match(first, /\x1b\[48;2;56;189;248m/);
  assert.match(second, /\x1b\[48;2;251;191;36m/);
});
