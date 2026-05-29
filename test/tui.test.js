import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWidgetOption,
  buildWidgetOptionRows,
  clearWidgetColors,
  defaultWidgetForType,
  describeWidgetOptions,
  describeWidgetColors,
  describeWidget,
  getConfigLines,
  moveWidget,
  sanitizePreviewConfig,
  setConfigLines,
  updateWidgetColor
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

test("TUI color helpers edit foreground, background, and clear aliases", () => {
  const foreground = updateWidgetColor({ type: "model", color: "red" }, "foreground", "#112233");
  assert.deepEqual(foreground, { type: "model", fg: "#112233" });

  const background = updateWidgetColor({ type: "model", backgroundColor: "blue" }, "background", "brightblack");
  assert.deepEqual(background, { type: "model", bg: "brightblack" });

  assert.equal(describeWidgetColors({ type: "model", fg: "#112233", bg: "brightblack", bold: true }), "fg=#112233, bg=brightblack, bold");
  assert.deepEqual(
    clearWidgetColors({ type: "model", fg: "red", color: "cyan", bg: "blue", background: "black", backgroundColor: "gray", bold: true }),
    { type: "model" }
  );
});

test("TUI widget option helpers expose type-specific rows", () => {
  const commandRows = buildWidgetOptionRows({ type: "command", command: "printf ok" }).map((row) => row.key);
  assert.ok(commandRows.includes("command"));
  assert.ok(commandRows.includes("timeout"));
  assert.ok(commandRows.includes("preserveColors"));

  const cwdRows = buildWidgetOptionRows({ type: "cwd" }).map((row) => row.key);
  assert.ok(cwdRows.includes("segments"));
  assert.ok(cwdRows.includes("home"));
  assert.ok(cwdRows.includes("fish"));

  const gitRows = buildWidgetOptionRows({ type: "gitBranch" }).map((row) => row.key);
  assert.ok(gitRows.includes("linkToRepo"));

  const remoteRows = buildWidgetOptionRows({ type: "gitOriginOwnerRepo" }).map((row) => row.key);
  assert.ok(remoteRows.includes("linkToRepo"));
  assert.ok(remoteRows.includes("hideNoRemote"));
  assert.ok(remoteRows.includes("ownerOnlyWhenFork"));

  const rootRows = buildWidgetOptionRows({ type: "gitRootDir" }).map((row) => row.key);
  assert.ok(rootRows.includes("linkToIDE"));

  const prRows = buildWidgetOptionRows({ type: "gitPullRequest" }).map((row) => row.key);
  assert.ok(prRows.includes("hideStatus"));
  assert.ok(prRows.includes("hideTitle"));

  const linkRows = buildWidgetOptionRows({ type: "link", metadata: { url: "https://example.com/docs", text: "Docs" } });
  assert.equal(linkRows.find((row) => row.key === "href")?.value, "https://example.com/docs");
  assert.equal(linkRows.find((row) => row.key === "text")?.value, "Docs");

  const timerRows = buildWidgetOptionRows({ type: "blockResetTimer" }).map((row) => row.key);
  assert.ok(timerRows.includes("timerMode"));
  assert.ok(timerRows.includes("timeZone"));
  assert.ok(timerRows.includes("hour12"));

  const usageRows = buildWidgetOptionRows({ type: "sessionUsage", metadata: { display: "slider", invert: "true" } });
  assert.equal(usageRows.find((row) => row.key === "display")?.value, "slider");
  assert.equal(usageRows.find((row) => row.key === "invert")?.value, "on");
  assert.ok(usageRows.map((row) => row.key).includes("cursor"));

  const statusRows = buildWidgetOptionRows({ type: "voiceStatus", metadata: { format: "icon", nerdFont: "true" } });
  assert.equal(statusRows.find((row) => row.key === "format")?.value, "icon");
  assert.equal(statusRows.find((row) => row.key === "nerdFont")?.value, "on");

  const compactionRows = buildWidgetOptionRows({ type: "compactions" }).map((row) => row.key);
  assert.ok(compactionRows.includes("format"));
  assert.ok(compactionRows.includes("nerdFont"));
  assert.ok(compactionRows.includes("hideZero"));
});

test("TUI widget option helpers apply common and specific settings", () => {
  assert.deepEqual(applyWidgetOption({ type: "model" }, "raw"), { type: "model", label: "" });
  assert.deepEqual(applyWidgetOption({ type: "model", label: "" }, "raw"), { type: "model" });
  assert.deepEqual(applyWidgetOption({ type: "model" }, "merge"), { type: "model", merge: true });
  assert.deepEqual(applyWidgetOption({ type: "model", merge: true }, "merge"), { type: "model", merge: "no-padding" });
  assert.deepEqual(applyWidgetOption({ type: "model", merge: "no-padding" }, "merge"), { type: "model" });

  const command = applyWidgetOption({ type: "command" }, "timeout", "2500");
  assert.deepEqual(command, { type: "command", timeout: 2500 });
  assert.deepEqual(applyWidgetOption({ type: "command", commandPath: "printf old" }, "command", "printf new"), {
    type: "command",
    command: "printf new"
  });

  const cwd = applyWidgetOption(applyWidgetOption({ type: "cwd" }, "segments", "2"), "fish");
  assert.deepEqual(cwd, { type: "cwd", segments: 2, fish: true });

  const timer = applyWidgetOption({ type: "blockResetTimer" }, "timerMode");
  assert.deepEqual(timer, { type: "blockResetTimer", mode: "timestamp" });

  assert.deepEqual(applyWidgetOption({ type: "sessionUsage" }, "display"), { type: "sessionUsage", display: "progress" });
  assert.deepEqual(applyWidgetOption({ type: "sessionUsage", metadata: { display: "slider-only" } }, "display"), { type: "sessionUsage" });
  assert.deepEqual(applyWidgetOption({ type: "sessionUsage" }, "invert"), { type: "sessionUsage", invert: true });
  assert.deepEqual(applyWidgetOption({ type: "sessionUsage", metadata: { cursor: "true" } }, "cursor"), { type: "sessionUsage" });

  assert.deepEqual(applyWidgetOption({ type: "vimMode" }, "format"), { type: "vimMode", format: "icon-letter" });
  assert.deepEqual(applyWidgetOption({ type: "voiceStatus", metadata: { format: "icon" } }, "format"), { type: "voiceStatus", format: "icon-text" });
  assert.deepEqual(applyWidgetOption({ type: "voiceStatus", metadata: { nerdFont: "true" } }, "nerdFont"), { type: "voiceStatus" });
  assert.deepEqual(applyWidgetOption({ type: "compactions" }, "hideZero"), { type: "compactions", hideZero: true });

  assert.deepEqual(applyWidgetOption({ type: "gitBranch", linkToGitHub: true }, "linkToRepo"), { type: "gitBranch" });
  assert.deepEqual(applyWidgetOption({ type: "gitBranch", metadata: { linkToGitHub: "true" } }, "linkToRepo"), { type: "gitBranch" });
  assert.deepEqual(applyWidgetOption({ type: "gitOriginRepo" }, "linkToRepo"), { type: "gitOriginRepo", linkToRepo: true });
  assert.deepEqual(applyWidgetOption({ type: "gitOriginRepo" }, "hideNoRemote"), { type: "gitOriginRepo", hideNoRemote: true });
  assert.deepEqual(applyWidgetOption({ type: "gitOriginOwnerRepo" }, "ownerOnlyWhenFork"), { type: "gitOriginOwnerRepo", ownerOnlyWhenFork: true });
  assert.deepEqual(applyWidgetOption({ type: "gitPullRequest" }, "hideStatus"), { type: "gitPullRequest", hideStatus: true });
  assert.deepEqual(applyWidgetOption({ type: "gitPullRequest", metadata: { hideTitle: "true" } }, "hideTitle"), { type: "gitPullRequest" });
  assert.deepEqual(applyWidgetOption({ type: "gitRootDir" }, "linkToIDE"), { type: "gitRootDir", linkToIDE: "vscode" });
  assert.deepEqual(applyWidgetOption({ type: "gitRootDir", linkToIDE: "vscode" }, "linkToIDE"), { type: "gitRootDir", linkToIDE: "cursor" });
  assert.deepEqual(applyWidgetOption({ type: "gitRootDir", metadata: { linkToCursor: "true" } }, "linkToIDE"), { type: "gitRootDir" });
  assert.deepEqual(applyWidgetOption({ type: "link", metadata: { url: "https://example.com/docs" } }, "text", "Docs"), {
    type: "link",
    metadata: { url: "https://example.com/docs" },
    text: "Docs"
  });
  assert.deepEqual(applyWidgetOption({ type: "sessionUsage", metadata: { display: "slider", invert: "true", keep: "yes" } }, "clear"), {
    type: "sessionUsage",
    metadata: { keep: "yes" }
  });

  assert.equal(describeWidgetOptions({ type: "cwd", segments: 2, fish: true, home: false }), "segments=2, fish, no-home");
  assert.equal(describeWidgetOptions({ type: "gitBranch", linkToRepo: true }), "repo-link");
  assert.equal(describeWidgetOptions({ type: "gitOriginRepo", hideNoRemote: true }), "hide-no-remote");
  assert.equal(describeWidgetOptions({ type: "gitPullRequest", hideStatus: true, hideTitle: true }), "hide-status, hide-title");
  assert.equal(describeWidgetOptions({ type: "gitRootDir", linkToIDE: "cursor" }), "link-cursor");
  assert.equal(describeWidgetOptions({ type: "sessionUsage", display: "progress-short", invert: true, cursor: true }), "display=progress-short, invert, cursor");
  assert.equal(describeWidgetOptions({ type: "compactions", nerdFont: true, hideZero: true }), "nerd-font, hide-zero");
});
