import test from "node:test";
import assert from "node:assert/strict";
import { convertCcstatuslineSettings } from "../src/config.js";

test("converts ccstatusline settings into cxstatusline config", () => {
  const config = convertCcstatuslineSettings({
    minimalistMode: true,
    defaultSeparator: " :: ",
    gitCacheTtlSeconds: 7,
    powerline: {
      enabled: true,
      separators: ["U+E0B0"],
      startCaps: ["["],
      endCaps: ["]"],
      autoAlign: true,
      continueThemeAcrossLines: true
    },
    lines: [
      [
        { type: "model", color: "cyan" },
        { type: "separator" },
        { type: "git-branch", color: "magenta" },
        { type: "custom-command", command: "printf ok", preserveColors: true },
        { type: "tokens-total", rawValue: true },
        { type: "current-working-dir", metadata: { segments: "2", fish: "true" } }
      ],
      [
        { type: "flex-separator" },
        { type: "reset-timer", color: "brightYellow", metadata: { format: "timestamp", timeZone: "UTC", hour12: "false" } }
      ]
    ]
  });

  assert.equal(config.minimal, true);
  assert.equal(config.separator, " :: ");
  assert.equal(config.gitCacheTtlMs, 7000);
  assert.equal(config.mode, "powerline");
  assert.deepEqual(config.powerline.startCaps, ["["]);
  assert.equal(config.powerline.autoAlign, true);
  assert.equal(config.powerline.continueThemeAcrossLines, true);
  assert.equal(config.lines[0][0].type, "model");
  assert.equal(config.lines[0][0].fg, "#0891b2");
  assert.equal(config.lines[0][1].type, "separator");
  assert.equal(config.lines[0][1].text, " :: ");
  assert.equal(config.lines[0][2].type, "gitBranch");
  assert.equal(config.lines[0][3].type, "command");
  assert.equal(config.lines[0][3].preserveColors, true);
  assert.equal(config.lines[0][4].type, "tokens");
  assert.equal(config.lines[0][4].label, "");
  assert.equal(config.lines[0][5].type, "cwd");
  assert.equal(config.lines[0][5].segments, 2);
  assert.equal(config.lines[0][5].fish, true);
  assert.equal(config.lines[1][0].type, "spacer");
  assert.equal(config.lines[1][1].type, "blockResetTimer");
  assert.equal(config.lines[1][1].fg, "#eab308");
  assert.equal(config.lines[1][1].format, "timestamp");
  assert.equal(config.lines[1][1].timeZone, "UTC");
  assert.equal(config.lines[1][1].hour12, false);
});
