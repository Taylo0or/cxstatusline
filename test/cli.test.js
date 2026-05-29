import test from "node:test";
import assert from "node:assert/strict";
import { applyConfigureFlags, tmuxSnippet } from "../src/cli.js";
import { DEFAULT_CONFIG } from "../src/constants.js";

test("applies configure flags for widgets and powerline options", () => {
  const config = applyConfigureFlags(structuredClone(DEFAULT_CONFIG), {
    widgets: "model,git-branch,tokens-total",
    separator: " :: ",
    "flex-mode": "full-until-compact",
    "compact-threshold": "70",
    "refresh-interval": "10",
    "default-padding": " ",
    "inherit-separator-colors": true,
    "global-bold": true,
    "override-fg": "cyan",
    "override-bg": "bg:black",
    minimal: true,
    "show-empty": true,
    "powerline-separators": "U+E0B0,>",
    "powerline-invert-separators": "false,true",
    "powerline-start-caps": "[",
    "powerline-end-caps": "]",
    "powerline-auto-align": true,
    "powerline-continue-theme": true
  });

  assert.deepEqual(config.widgets, [{ type: "model" }, { type: "gitBranch" }, { type: "tokens" }]);
  assert.equal(config.separator, " :: ");
  assert.equal(config.flexMode, "full-until-compact");
  assert.equal(config.compactThreshold, 70);
  assert.equal(config.refreshIntervalSeconds, 10);
  assert.equal(config.defaultSeparator, " :: ");
  assert.equal(config.defaultPadding, " ");
  assert.equal(config.inheritSeparatorColors, true);
  assert.equal(config.globalBold, true);
  assert.equal(config.overrideForegroundColor, "cyan");
  assert.equal(config.overrideBackgroundColor, "bg:black");
  assert.equal(config.minimal, true);
  assert.equal(config.hideEmpty, false);
  assert.equal(config.powerline.separator, "U+E0B0");
  assert.deepEqual(config.powerline.separators, ["U+E0B0", ">"]);
  assert.deepEqual(config.powerline.separatorInvertBackground, [false, true]);
  assert.deepEqual(config.powerline.startCaps, ["["]);
  assert.deepEqual(config.powerline.endCaps, ["]"]);
  assert.equal(config.powerline.autoAlign, true);
  assert.equal(config.powerline.continueThemeAcrossLines, true);
});

test("applies refresh interval flags and tmux snippet status interval", () => {
  const config = applyConfigureFlags({ ...structuredClone(DEFAULT_CONFIG), refreshIntervalSeconds: 10 }, {
    "refresh-interval": "off"
  });
  assert.equal(config.refreshIntervalSeconds, undefined);
  assert.match(tmuxSnippet({ width: 80, "refresh-interval": "5" }), /set -g status-interval 5/);
  assert.match(tmuxSnippet({ width: 80, "refresh-interval": "5" }), /cxstatusline render --width 80/);
});

test("applies configure flags that disable booleans", () => {
  const config = applyConfigureFlags({
    ...structuredClone(DEFAULT_CONFIG),
    minimal: true,
    hideEmpty: true,
    powerline: {
      autoAlign: true,
      continueThemeAcrossLines: true
    }
  }, {
    minimal: "false",
    "show-empty": true,
    "no-inherit-separator-colors": true,
    "no-global-bold": true,
    "no-powerline-auto-align": true,
    "powerline-continue-theme": "false"
  });

  assert.equal(config.minimal, false);
  assert.equal(config.hideEmpty, false);
  assert.equal(config.inheritSeparatorColors, false);
  assert.equal(config.globalBold, false);
  assert.equal(config.powerline.autoAlign, false);
  assert.equal(config.powerline.continueThemeAcrossLines, false);
});
