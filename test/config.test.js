import test from "node:test";
import assert from "node:assert/strict";
import { convertCcstatuslineSettings } from "../src/config.js";

test("converts ccstatusline settings into cxstatusline config", () => {
  const config = convertCcstatuslineSettings({
    minimalistMode: true,
    refreshInterval: 10,
    flexMode: "full-until-compact",
    compactThreshold: 70,
    defaultSeparator: " :: ",
    defaultPadding: " ",
    inheritSeparatorColors: true,
    globalBold: true,
    overrideForegroundColor: "cyan",
    overrideBackgroundColor: "bg:brightBlack",
    gitCacheTtlSeconds: 7,
    powerline: {
      enabled: true,
      separators: ["U+E0B0", ">"],
      separatorInvertBackground: [false, true],
      startCaps: ["["],
      endCaps: ["]"],
      autoAlign: true,
      continueThemeAcrossLines: true
    },
    lines: [
      [
        { type: "model", color: "cyan", merge: "no-padding", bold: true },
        { type: "separator" },
        { type: "git-branch", color: "magenta", metadata: { linkToGitHub: "true", linkToRepo: "false" } },
        { type: "custom-command", commandPath: "printf ok", maxWidth: 8, preserveColors: true },
        { type: "tokens-total", rawValue: true },
        { type: "current-working-dir", metadata: { segments: "2", fish: "true" } },
        { type: "git-root-dir", metadata: { linkToIDE: "cursor", linkToCursor: "true" } },
        { type: "git-is-fork", metadata: { hideWhenNotFork: "true" } }
      ],
      [
        { type: "flex-separator" },
        { type: "git-origin-owner-repo", metadata: { linkToRepo: "true", ownerOnlyWhenFork: "true", hideNoRemote: "true" } },
        { type: "link", metadata: { url: "https://example.com/docs", text: "Docs" } },
        { type: "reset-timer", color: "brightYellow", metadata: { format: "timestamp", timeZone: "UTC", timezone: "UTC", hour12: "false", absolute: "true" } },
        { type: "jj-workspace", metadata: { hideNoJj: "true" } },
        { type: "extra-usage-remaining", metadata: { hideIfDisabled: "true" } }
      ]
    ]
  });

  assert.equal(config.minimal, true);
  assert.equal(config.refreshIntervalSeconds, 10);
  assert.equal(config.flexMode, "full-until-compact");
  assert.equal(config.compactThreshold, 70);
  assert.equal(config.defaultSeparator, " :: ");
  assert.equal(config.separator, " :: ");
  assert.equal(config.defaultPadding, " ");
  assert.equal(config.inheritSeparatorColors, true);
  assert.equal(config.globalBold, true);
  assert.equal(config.overrideForegroundColor, "#0891b2");
  assert.equal(config.overrideBackgroundColor, "#475569");
  assert.equal(config.gitCacheTtlMs, 7000);
  assert.equal(config.mode, "powerline");
  assert.equal(config.powerline.separator, "U+E0B0");
  assert.deepEqual(config.powerline.separators, ["U+E0B0", ">"]);
  assert.deepEqual(config.powerline.separatorInvertBackground, [false, true]);
  assert.deepEqual(config.powerline.startCaps, ["["]);
  assert.deepEqual(config.powerline.endCaps, ["]"]);
  assert.equal(config.powerline.autoAlign, true);
  assert.equal(config.powerline.continueThemeAcrossLines, true);
  assert.equal(config.lines[0][0].type, "model");
  assert.equal(config.lines[0][0].fg, "#0891b2");
  assert.equal(config.lines[0][0].merge, "no-padding");
  assert.equal(config.lines[0][0].bold, true);
  assert.equal(config.lines[0][1].type, "separator");
  assert.equal(config.lines[0][1].text, " :: ");
  assert.equal(config.lines[0][2].type, "gitBranch");
  assert.equal(config.lines[0][2].linkToGitHub, true);
  assert.equal(config.lines[0][2].linkToRepo, false);
  assert.equal(config.lines[0][3].type, "command");
  assert.equal(config.lines[0][3].maxWidth, 8);
  assert.equal(config.lines[0][3].preserveColors, true);
  assert.equal(config.lines[0][4].type, "tokens");
  assert.equal(config.lines[0][4].label, "");
  assert.equal(config.lines[0][5].type, "cwd");
  assert.equal(config.lines[0][5].segments, 2);
  assert.equal(config.lines[0][5].fish, true);
  assert.equal(config.lines[0][6].type, "gitRootDir");
  assert.equal(config.lines[0][6].linkToIDE, "cursor");
  assert.equal(config.lines[0][6].linkToCursor, true);
  assert.equal(config.lines[0][7].type, "gitIsFork");
  assert.equal(config.lines[0][7].hideWhenNotFork, true);
  assert.equal(config.lines[1][0].type, "spacer");
  assert.equal(config.lines[1][1].type, "gitOriginOwnerRepo");
  assert.equal(config.lines[1][1].linkToRepo, true);
  assert.equal(config.lines[1][1].ownerOnlyWhenFork, true);
  assert.equal(config.lines[1][1].hideNoRemote, true);
  assert.equal(config.lines[1][2].type, "link");
  assert.equal(config.lines[1][2].url, "https://example.com/docs");
  assert.equal(config.lines[1][2].text, "Docs");
  assert.equal(config.lines[1][3].type, "blockResetTimer");
  assert.equal(config.lines[1][3].fg, "#eab308");
  assert.equal(config.lines[1][3].format, "timestamp");
  assert.equal(config.lines[1][3].timeZone, "UTC");
  assert.equal(config.lines[1][3].timezone, "UTC");
  assert.equal(config.lines[1][3].absolute, true);
  assert.equal(config.lines[1][3].hour12, false);
  assert.equal(config.lines[1][4].type, "jjWorkspace");
  assert.equal(config.lines[1][4].hideNoJj, true);
  assert.equal(config.lines[1][5].type, "extraUsageRemaining");
  assert.equal(config.lines[1][5].hideIfDisabled, true);
});
