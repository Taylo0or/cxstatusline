import test from "node:test";
import assert from "node:assert/strict";
import { applyConfigureFlags } from "../src/cli.js";
import { DEFAULT_CONFIG } from "../src/constants.js";

test("applies configure flags for widgets and powerline options", () => {
  const config = applyConfigureFlags(structuredClone(DEFAULT_CONFIG), {
    widgets: "model,git-branch,tokens-total",
    separator: " :: ",
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
