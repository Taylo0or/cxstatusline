import { existsSync } from "node:fs";
import readline from "node:readline/promises";
import { dirname } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { CODEX_NATIVE_ITEMS, DEFAULT_NATIVE_STATUS_LINE, PRESETS, THEMES } from "./constants.js";
import { applyPreset, defaultConfigPath, importCcstatuslineConfig, initConfig, loadConfig, normalizeRefreshIntervalSeconds, saveConfig } from "./config.js";
import { codexConfigPath, installNativeStatusLine, readCodexConfig, uninstallNativeStatusLine } from "./codexConfig.js";
import { getGitInfo } from "./git.js";
import { hooksPath, installHooks, uninstallHooks } from "./install.js";
import { renderStatusLine } from "./render.js";
import { listWidgets, resolveWidgetType } from "./widgets.js";
import { loadState, readHookPayload, resetState, saveState, statePath, updateStateFromHook } from "./state.js";
import { runTuiConfigEditor } from "./tui.js";
import { getUpdateStatus, runSelfUpdate } from "./update.js";
import { cacheDir, codexHome, configDir, homePath, parseFlags, readText, run, writeTextAtomic } from "./util.js";

export async function runCli(args) {
  const [command = "render", ...rest] = args;
  if (command === "help" || command === "--help" || command === "-h") return help();

  if (command === "render") return renderCommand(rest);
  if (command === "hook") return hookCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "install") return installCommand(rest);
  if (command === "uninstall") return uninstallCommand(rest);
  if (command === "import" || command === "migrate") return importCommand(rest);
  if (command === "configure" || command === "config") return configureCommand(rest);
  if (command === "tui") return tuiCommand(rest);
  if (command === "widgets") return widgetsCommand();
  if (command === "presets") return presetsCommand();
  if (command === "native-items") return nativeItemsCommand();
  if (command === "themes") return themesCommand();
  if (command === "bench" || command === "benchmark") return benchCommand(rest);
  if (command === "doctor") return doctorCommand();
  if (command === "reset") return resetCommand();
  if (command === "update-check" || command === "check-update") return updateCheckCommand(rest);
  if (command === "self-update" || command === "update") return selfUpdateCommand(rest);

  throw new Error(`Unknown command: ${command}\nRun "cxstatusline help" for usage.`);
}

function renderCommand(args) {
  const { flags } = parseFlags(args);
  let config = loadConfig({ config: flags.config });
  if (flags.theme) config.theme = flags.theme;
  if (flags.mode) config.mode = flags.mode;
  if (flags.minimal) config.minimal = true;
  if (flags.preset) config = applyPreset(config, flags.preset);
  if (flags.widgets) {
    config.widgets = String(flags.widgets).split(",").map((type) => ({ type: type.trim() })).filter((widget) => widget.type);
  }

  const state = loadState();
  const cwd = flags.cwd || state.cwd || process.cwd();
  const codexConfig = readCodexConfig();
  const git = getGitInfo(cwd, { ttlMs: config.gitCacheTtlMs });
  const output = renderStatusLine(
    { config, state, cwd, git, codexConfig },
    {
      theme: flags.theme,
      mode: flags.mode,
      format: flags.format,
      width: flags.width,
      color: flags["no-color"] ? false : flags.color !== "false"
    }
  );
  process.stdout.write(`${output}\n`);
}

async function hookCommand(args) {
  const payload = await readHookPayload(args);
  const next = updateStateFromHook(payload, loadState());
  saveState(next);
}

function initCommand(args) {
  const { flags } = parseFlags(args);
  const result = initConfig({ config: flags.config, force: flags.force, preset: flags.preset });
  console.log(result.created ? `Created ${result.path}` : `Already exists: ${result.path}`);
}

async function configureCommand(args) {
  const { flags } = parseFlags(args);
  let config = loadConfig({ config: flags.config });
  if (flags.tui || flags.fullscreen || flags["full-screen"]) {
    return configureTui(flags, config);
  }
  const interactive = !flags.yes && !flags.preset && !flags.theme && !flags.mode;

  if (interactive) {
    const rl = readline.createInterface({ input, output });
    try {
      const preset = await choose(rl, "Preset", Object.keys(PRESETS), "compact");
      const theme = await choose(rl, "Theme", Object.keys(THEMES), "powerline");
      const mode = await choose(rl, "Mode", ["powerline", "plain"], theme === "mono" ? "plain" : "powerline");
      const widgets = await optional(rl, "Widgets CSV", widgetCsv(config));
      flags.preset = preset;
      flags.theme = theme;
      flags.mode = mode;
      if (widgets) flags.widgets = widgets;
      const minimal = await yesNo(rl, "Minimal labels?", Boolean(config.minimal));
      flags[minimal ? "minimal" : "no-minimal"] = true;
      const hideEmpty = await yesNo(rl, "Hide empty widgets?", config.hideEmpty !== false);
      flags[hideEmpty ? "hide-empty" : "show-empty"] = true;
      const flexMode = await choose(rl, "Terminal width", ["full", "full-minus-40", "full-until-compact"], config.flexMode || "full");
      flags["flex-mode"] = flexMode;
      if (flexMode === "full-until-compact") {
        flags["compact-threshold"] = await optional(rl, "Compact threshold percent", config.compactThreshold || 60);
      }
      flags["refresh-interval"] = await optional(rl, "External refresh interval seconds (blank/off disables)", config.refreshIntervalSeconds || "");
      flags["default-padding"] = await optional(rl, "Default padding", config.defaultPadding || "");
      if (mode === "plain") {
        flags["default-separator"] = await optional(rl, "Plain separator", config.defaultSeparator ?? config.separator ?? " | ");
        const inherit = await yesNo(rl, "Inherit separator colors?", Boolean(config.inheritSeparatorColors));
        flags[inherit ? "inherit-separator-colors" : "no-inherit-separator-colors"] = true;
        const globalBold = await yesNo(rl, "Global bold?", Boolean(config.globalBold));
        flags[globalBold ? "global-bold" : "no-global-bold"] = true;
        flags["override-fg"] = await optional(rl, "Override foreground color", config.overrideForegroundColor || "");
        flags["override-bg"] = await optional(rl, "Override background color", config.overrideBackgroundColor || "");
      } else {
        flags["powerline-separators"] = await optional(rl, "Powerline separators CSV", capCsv(config.powerline?.separators || config.powerline?.separator || "\uE0B0"));
        flags["powerline-start-caps"] = await optional(rl, "Powerline start caps CSV", capCsv(config.powerline?.startCaps || config.powerline?.startCap || ""));
        flags["powerline-end-caps"] = await optional(rl, "Powerline end caps CSV", capCsv(config.powerline?.endCaps || config.powerline?.endCap || ""));
        flags["powerline-invert-separators"] = await optional(rl, "Invert separator backgrounds CSV", boolCsv(config.powerline?.separatorInvertBackground || []));
        const autoAlign = await yesNo(rl, "Auto-align Powerline columns?", Boolean(config.powerline?.autoAlign));
        flags[autoAlign ? "powerline-auto-align" : "no-powerline-auto-align"] = true;
        const continueTheme = await yesNo(rl, "Continue Powerline theme across lines?", Boolean(config.powerline?.continueThemeAcrossLines));
        flags[continueTheme ? "powerline-continue-theme" : "no-powerline-continue-theme"] = true;
      }
      flags.installHooks = await yesNo(rl, "Install Codex hooks?", false);
      flags.installNative = await yesNo(rl, "Configure native Codex footer?", false);
    } finally {
      rl.close();
    }
  }

  config = applyConfigureFlags(config, flags);
  const path = saveConfig(config, { config: flags.config });
  console.log(`config: updated ${path}`);

  if (flags.installHooks || flags.hooks) {
    const result = installHooks({ dryRun: Boolean(flags["dry-run"]), command: flags.command });
    console.log(`hooks: ${flags["dry-run"] ? "would update" : "updated"} ${result.path}`);
  }
  if (flags.installNative || flags.native) {
    const result = installNativeStatusLine({ dryRun: Boolean(flags["dry-run"]) });
    console.log(`native: ${flags["dry-run"] ? "would update" : "updated"} ${result.path}`);
  }
}

async function tuiCommand(args) {
  const { flags } = parseFlags(args);
  return configureTui(flags, loadConfig({ config: flags.config }));
}

async function configureTui(flags, config) {
  const state = loadState();
  const cwd = flags.cwd || state.cwd || process.cwd();
  const result = await runTuiConfigEditor({
    config,
    state,
    cwd,
    git: getGitInfo(cwd),
    codexConfig: readCodexConfig()
  });
  if (!result.saved) {
    console.log("config: unchanged");
    return;
  }

  const path = saveConfig(result.config, { config: flags.config });
  console.log(`config: updated ${path}`);

  if (result.installHooks || flags.installHooks || flags.hooks) {
    const hooks = installHooks({ dryRun: Boolean(flags["dry-run"]), command: flags.command });
    console.log(`hooks: ${flags["dry-run"] ? "would update" : "updated"} ${hooks.path}`);
  }
  if (result.installNative || flags.installNative || flags.native) {
    const native = installNativeStatusLine({ dryRun: Boolean(flags["dry-run"]) });
    console.log(`native: ${flags["dry-run"] ? "would update" : "updated"} ${native.path}`);
  }
}

function importCommand(args) {
  const { flags, positionals } = parseFlags(args);
  const sourceName = positionals[0] || flags.source || "ccstatusline";
  if (sourceName !== "ccstatusline") {
    throw new Error("Unknown import source. Use: cxstatusline import ccstatusline");
  }

  const result = importCcstatuslineConfig({
    from: flags.from || flags.path,
    config: flags.config,
    dryRun: Boolean(flags["dry-run"])
  });

  if (flags["dry-run"]) {
    console.log(JSON.stringify(result.config, null, 2));
    return;
  }
  console.log(`config: imported ${result.source} -> ${result.path}`);
}

function installCommand(args) {
  const { flags, positionals } = parseFlags(args);
  const target = flags.target || positionals[0] || "all";
  const dryRun = Boolean(flags["dry-run"]);
  const results = [];

  if (target === "all" || target === "hooks") {
    results.push(["hooks", installHooks({ dryRun, command: flags.command })]);
  }

  if (target === "all" || target === "native") {
    const items = flags.items ? String(flags.items).split(",").map((item) => item.trim()).filter(Boolean) : DEFAULT_NATIVE_STATUS_LINE;
    results.push(["native", installNativeStatusLine({ dryRun, items, useColors: flags.colors !== "false" })]);
  }

  if (target === "all" || target === "config") {
    results.push(["config", initConfig({ force: flags.force, preset: flags.preset })]);
  }

  if (target === "tmux") {
    const result = installTmux(flags);
    console.log(result.message);
    return;
  }

  if (target === "starship") {
    const result = installStarship(flags);
    console.log(result.message);
    return;
  }

  if (!results.length) {
    throw new Error(`Unknown install target: ${target}. Use all, hooks, native, config, tmux, or starship.`);
  }

  for (const [name, result] of results) {
    const mode = dryRun ? "would update" : result.changed || result.created ? "updated" : "unchanged";
    console.log(`${name}: ${mode} ${result.path}`);
    if (dryRun && result.after) {
      console.log(typeof result.after === "string" ? summarizeToml(result.after) : JSON.stringify(result.after, null, 2));
    }
  }
}

function uninstallCommand(args) {
  const { flags, positionals } = parseFlags(args);
  const target = flags.target || positionals[0] || "hooks";
  const dryRun = Boolean(flags["dry-run"]);
  if (target === "hooks") {
    const result = uninstallHooks({ dryRun });
    console.log(`hooks: ${dryRun ? "would update" : result.changed ? "updated" : "unchanged"} ${result.path}`);
    return;
  }
  if (target === "native") {
    const result = uninstallNativeStatusLine({ dryRun });
    console.log(`native: ${dryRun ? "would update" : result.changed ? "updated" : "unchanged"} ${result.path}`);
    return;
  }
  if (target === "tmux") {
    const result = uninstallMarkedConfig("cxstatusline tmux", flags.path || homePath(".tmux.conf"), dryRun);
    console.log(`tmux: ${dryRun ? "would update" : result.changed ? "updated" : "unchanged"} ${result.path}`);
    return;
  }
  if (target === "starship") {
    const result = uninstallMarkedConfig("cxstatusline starship", flags.path || homePath(".config", "starship.toml"), dryRun);
    console.log(`starship: ${dryRun ? "would update" : result.changed ? "updated" : "unchanged"} ${result.path}`);
    return;
  }
  throw new Error("Unknown uninstall target. Use hooks, native, tmux, or starship.");
}

function widgetsCommand() {
  for (const widget of listWidgets()) {
    console.log(`${widget.name.padEnd(16)} ${widget.description}`);
  }
}

function presetsCommand() {
  for (const name of Object.keys(PRESETS)) console.log(name);
}

function nativeItemsCommand() {
  for (const item of CODEX_NATIVE_ITEMS) {
    console.log(`${item.id.padEnd(22)} ${item.description}`);
  }
}

function themesCommand() {
  for (const name of Object.keys(THEMES)) console.log(name);
}

function doctorCommand() {
  const codex = run("codex", ["--version"], { timeout: 2000 });
  const codexVersion = codex.ok ? codex.stdout.trim() : "not found";
  const hooks = existsSync(hooksPath());
  const config = existsSync(defaultConfigPath());
  const state = existsSync(statePath());
  const codexConfig = existsSync(codexConfigPath());

  const checks = [
    ["node", process.version],
    ["codex", codexVersion],
    ["CODEX_HOME", codexHome()],
    ["config dir", configDir()],
    ["cache dir", cacheDir()],
    ["cx config", `${config ? "present" : "missing"} ${defaultConfigPath()}`],
    ["codex config", `${codexConfig ? "present" : "missing"} ${codexConfigPath()}`],
    ["hooks", `${hooks ? "present" : "missing"} ${hooksPath()}`],
    ["state", `${state ? "present" : "missing"} ${statePath()}`],
    ["project root", dirname(dirname(new URL(import.meta.url).pathname))]
  ];

  for (const [label, value] of checks) {
    console.log(`${label.padEnd(13)} ${value}`);
  }
}

function resetCommand() {
  const state = resetState();
  console.log(`Reset state at ${statePath()} (${state.resetAt})`);
}

function updateCheckCommand(args) {
  const { flags } = parseFlags(args);
  const status = getUpdateStatus({ manager: flags.manager || "npm" });
  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`current        ${status.current}`);
  console.log(`latest         ${status.latest}`);
  console.log(`update         ${status.updateAvailable ? "available" : "not needed"}`);
  console.log(`pinned install ${status.installCommand}`);
}

function selfUpdateCommand(args) {
  const { flags } = parseFlags(args);
  const result = runSelfUpdate({
    tag: flags.tag,
    target: flags.target,
    manager: flags.manager || "npm",
    dryRun: Boolean(flags["dry-run"])
  });
  if (flags["dry-run"]) {
    console.log(result.commandText);
    return;
  }
  if (!result.ok) {
    throw new Error(result.stderr || result.error?.message || `Self-update failed: ${result.commandText}`);
  }
  process.stdout.write(result.stdout || "");
  if (result.stderr) process.stderr.write(result.stderr);
}

function benchCommand(args) {
  const { flags } = parseFlags(args);
  const iterations = Number(flags.iterations || flags.n || 200);
  let config = loadConfig({ config: flags.config });
  if (flags.preset) config = applyPreset(config, flags.preset);
  const state = loadState();
  const cwd = flags.cwd || state.cwd || process.cwd();
  const codexConfig = readCodexConfig();
  const git = getGitInfo(cwd, { ttlMs: config.gitCacheTtlMs ?? 0 });
  const start = performance.now();
  let last = "";
  for (let index = 0; index < iterations; index += 1) {
    last = renderStatusLine({ config, state, cwd, git, codexConfig }, { format: flags.format || "plain", width: flags.width || 120 });
  }
  const elapsed = performance.now() - start;
  const avgMs = elapsed / iterations;
  const maxAvgMs = flags["max-avg-ms"] || flags.maxAvgMs;
  if (maxAvgMs && avgMs > Number(maxAvgMs)) {
    process.exitCode = 1;
  }
  console.log(JSON.stringify({
    iterations,
    totalMs: Number(elapsed.toFixed(3)),
    avgMs: Number(avgMs.toFixed(3)),
    chars: last.length,
    threshold: maxAvgMs ? { maxAvgMs: Number(maxAvgMs), passed: avgMs <= Number(maxAvgMs) } : null
  }, null, 2));
}

function help() {
  console.log(`cxstatusline

Usage:
  cxstatusline render [--format plain|ansi|json] [--theme name] [--mode powerline|plain]
  cxstatusline hook
  cxstatusline configure [--preset name] [--theme name] [--mode name] [--widgets csv] [--flex-mode mode] [--tui]
  cxstatusline import ccstatusline [--from path] [--dry-run]
  cxstatusline init [--force]
  cxstatusline tui [--config path]
  cxstatusline install [all|hooks|native|config|tmux|starship] [--dry-run] [--write] [--refresh-interval seconds]
  cxstatusline uninstall [hooks|native|tmux|starship]
  cxstatusline widgets
  cxstatusline presets
  cxstatusline native-items
  cxstatusline themes
  cxstatusline bench [--iterations 500] [--max-avg-ms 5]
  cxstatusline update-check [--json]
  cxstatusline self-update [--dry-run] [--tag vX.Y.Z]
  cxstatusline doctor
  cxstatusline reset

Examples:
  cxstatusline render --format plain
  cxstatusline render --preset compact --format plain
  cxstatusline configure --preset compact --theme powerline --yes
  cxstatusline configure --widgets model,git-branch,tokens-total --separator ' :: ' --yes
  cxstatusline configure --tui
  cxstatusline tui
  cxstatusline configure --flex-mode full-until-compact --compact-threshold 70 --yes
  cxstatusline configure --refresh-interval 10 --yes
  cxstatusline configure --mode plain --default-padding ' ' --global-bold --override-fg cyan --yes
  cxstatusline configure --powerline-separators 'U+E0B0,U+E0B1' --powerline-auto-align --yes
  cxstatusline import ccstatusline --dry-run
  cxstatusline install hooks
  cxstatusline install tmux
  cxstatusline install tmux --write --preset compact --refresh-interval 10
  cxstatusline install native --items model-with-reasoning,context-used,git-branch,run-state
  cxstatusline update-check
  cxstatusline self-update --dry-run
  tmux set -g status-right '#(cxstatusline render --width 80)'
`);
}

export function applyConfigureFlags(config, flags = {}) {
  let outputConfig = config;
  if (flags.preset) outputConfig = applyPreset(outputConfig, flags.preset);
  if (flags.theme) outputConfig.theme = flags.theme;
  if (flags.mode) outputConfig.mode = flags.mode;
  if (flags.widgets) {
    outputConfig.widgets = splitCsv(flags.widgets).map((type) => ({ type: resolveWidgetType(type) || type }));
    delete outputConfig.lines;
  }
  if (flags.separator !== undefined) {
    outputConfig.separator = String(flags.separator);
    outputConfig.defaultSeparator = String(flags.separator);
  }
  if (flags["default-separator"] !== undefined) {
    outputConfig.defaultSeparator = String(flags["default-separator"]);
    outputConfig.separator = String(flags["default-separator"]);
  }
  if (flags["default-padding"] !== undefined) outputConfig.defaultPadding = String(flags["default-padding"]);
  if (flags.minimal !== undefined) outputConfig.minimal = parseBoolean(flags.minimal);
  if (flags["no-minimal"] !== undefined) outputConfig.minimal = false;
  if (flags["hide-empty"] !== undefined) outputConfig.hideEmpty = parseBoolean(flags["hide-empty"]);
  if (flags["show-empty"] !== undefined) outputConfig.hideEmpty = false;
  if (flags["flex-mode"] !== undefined || flags.flexMode !== undefined) {
    const flexMode = String(flags["flex-mode"] ?? flags.flexMode);
    if (["full", "full-minus-40", "full-until-compact"].includes(flexMode)) outputConfig.flexMode = flexMode;
  }
  if (flags["compact-threshold"] !== undefined || flags.compactThreshold !== undefined) {
    const threshold = Number(flags["compact-threshold"] ?? flags.compactThreshold);
    if (Number.isFinite(threshold) && threshold > 0) outputConfig.compactThreshold = Math.min(99, Math.max(1, Math.round(threshold)));
  }
  if (flags["refresh-interval"] !== undefined || flags.refreshInterval !== undefined || flags["refresh-interval-seconds"] !== undefined) {
    const raw = flags["refresh-interval"] ?? flags.refreshInterval ?? flags["refresh-interval-seconds"];
    const interval = normalizeRefreshIntervalSeconds(raw);
    if (interval) outputConfig.refreshIntervalSeconds = interval;
    else delete outputConfig.refreshIntervalSeconds;
  }
  if (flags["inherit-separator-colors"] !== undefined) outputConfig.inheritSeparatorColors = parseBoolean(flags["inherit-separator-colors"]);
  if (flags["no-inherit-separator-colors"] !== undefined) outputConfig.inheritSeparatorColors = false;
  if (flags["global-bold"] !== undefined) outputConfig.globalBold = parseBoolean(flags["global-bold"]);
  if (flags["no-global-bold"] !== undefined) outputConfig.globalBold = false;
  if (flags["override-fg"] !== undefined || flags["override-foreground"] !== undefined) {
    outputConfig.overrideForegroundColor = String(flags["override-fg"] ?? flags["override-foreground"]);
  }
  if (flags["override-bg"] !== undefined || flags["override-background"] !== undefined) {
    outputConfig.overrideBackgroundColor = String(flags["override-bg"] ?? flags["override-background"]);
  }
  if (flags["clear-override-fg"] !== undefined) delete outputConfig.overrideForegroundColor;
  if (flags["clear-override-bg"] !== undefined) delete outputConfig.overrideBackgroundColor;

  const powerline = { ...(outputConfig.powerline || {}) };
  let hasPowerlineUpdate = false;
  if (flags["powerline-separators"] !== undefined) {
    powerline.separators = splitCsv(flags["powerline-separators"]);
    powerline.separator = powerline.separators[0] || powerline.separator;
    hasPowerlineUpdate = true;
  }
  if (flags["powerline-start-caps"] !== undefined) {
    powerline.startCaps = splitCsv(flags["powerline-start-caps"]);
    hasPowerlineUpdate = true;
  }
  if (flags["powerline-end-caps"] !== undefined) {
    powerline.endCaps = splitCsv(flags["powerline-end-caps"]);
    hasPowerlineUpdate = true;
  }
  if (flags["powerline-invert-separators"] !== undefined) {
    powerline.separatorInvertBackground = splitCsv(flags["powerline-invert-separators"]).map(parseBoolean);
    hasPowerlineUpdate = true;
  }
  if (flags["powerline-auto-align"] !== undefined || flags["auto-align"] !== undefined) {
    powerline.autoAlign = parseBoolean(flags["powerline-auto-align"] ?? flags["auto-align"]);
    hasPowerlineUpdate = true;
  }
  if (flags["no-powerline-auto-align"] !== undefined || flags["no-auto-align"] !== undefined) {
    powerline.autoAlign = false;
    hasPowerlineUpdate = true;
  }
  if (flags["powerline-continue-theme"] !== undefined || flags["continue-theme"] !== undefined) {
    powerline.continueThemeAcrossLines = parseBoolean(flags["powerline-continue-theme"] ?? flags["continue-theme"]);
    hasPowerlineUpdate = true;
  }
  if (flags["no-powerline-continue-theme"] !== undefined || flags["no-continue-theme"] !== undefined) {
    powerline.continueThemeAcrossLines = false;
    hasPowerlineUpdate = true;
  }
  if (hasPowerlineUpdate) outputConfig.powerline = powerline;
  return outputConfig;
}

async function choose(rl, label, values, fallback) {
  const display = values.map((value, index) => `${index + 1}) ${value}`).join("  ");
  const answer = (await rl.question(`${label} [${fallback}] ${display}\n> `)).trim();
  if (!answer) return fallback;
  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= values.length) return values[index - 1];
  return values.includes(answer) ? answer : fallback;
}

async function yesNo(rl, question, fallback) {
  const answer = (await rl.question(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
  if (!answer) return fallback;
  return ["y", "yes"].includes(answer);
}

async function optional(rl, label, fallback) {
  const answer = (await rl.question(`${label} [${fallback}]\n> `)).trim();
  return answer || fallback;
}

function widgetCsv(config) {
  const widgets = Array.isArray(config.widgets) ? config.widgets : [];
  return widgets.map((widget) => typeof widget === "string" ? widget : widget.type).filter(Boolean).join(",");
}

function capCsv(value) {
  if (Array.isArray(value)) return value.join(",");
  return value || "";
}

function boolCsv(value) {
  return Array.isArray(value) ? value.map((item) => item ? "true" : "false").join(",") : "";
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value) {
  return ["1", "true", "yes", "y", "on", "invert", "inverted"].includes(String(value).trim().toLowerCase());
}

function summarizeToml(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[tui]");
  if (start === -1) return text;
  const end = lines.findIndex((line, index) => index > start && /^\[[^\]]+]$/.test(line.trim()));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

export function tmuxSnippet(flags) {
  const width = flags.width || 90;
  const preset = flags.preset ? ` --preset ${flags.preset}` : "";
  const interval = tmuxRefreshInterval(flags);
  return [
    interval ? `set -g status-interval ${interval}` : "",
    `set -g status-right '#(cxstatusline render --width ${width}${preset})'`
  ].filter(Boolean).join("\n");
}

export function starshipSnippet(flags) {
  const preset = flags.preset ? ` --preset ${flags.preset}` : "";
  return `[custom.cxstatusline]
command = "cxstatusline render --format plain${preset}"
when = "true"
shell = ["sh", "-c"]
style = "bold blue"
format = "[$output]($style)"`;
}

function tmuxRefreshInterval(flags) {
  const raw = flags["refresh-interval"] ?? flags.refreshInterval ?? flags["refresh-interval-seconds"];
  if (raw !== undefined) return normalizeRefreshIntervalSeconds(raw);
  const config = loadConfig({ config: flags.config });
  return normalizeRefreshIntervalSeconds(config.refreshIntervalSeconds);
}

function installTmux(flags) {
  const snippet = markedBlock("cxstatusline tmux", tmuxSnippet(flags));
  const path = flags.path || homePath(".tmux.conf");
  if (!flags.write) return { path, message: `# Add to ${path}\n${snippet}` };
  const before = readText(path, "");
  const after = upsertMarkedBlock(before, "cxstatusline tmux", tmuxSnippet(flags));
  writeTextAtomic(path, after);
  return { path, message: `tmux: updated ${path}` };
}

function installStarship(flags) {
  const snippet = markedBlock("cxstatusline starship", starshipSnippet(flags));
  const path = flags.path || homePath(".config", "starship.toml");
  if (!flags.write) return { path, message: `# Add to ${path}\n${snippet}` };
  const before = readText(path, "");
  const after = upsertMarkedBlock(before, "cxstatusline starship", starshipSnippet(flags));
  writeTextAtomic(path, after);
  return { path, message: `starship: updated ${path}` };
}

function markedBlock(name, body) {
  return `# >>> ${name}\n${body}\n# <<< ${name}`;
}

function upsertMarkedBlock(text, name, body) {
  const block = markedBlock(name, body);
  const pattern = new RegExp(`# >>> ${escapeRegExp(name)}[\\s\\S]*?# <<< ${escapeRegExp(name)}`);
  if (pattern.test(text)) return text.replace(pattern, block);
  const prefix = text && !text.endsWith("\n") ? "\n\n" : text ? "\n" : "";
  return `${text}${prefix}${block}\n`;
}

function removeMarkedBlock(text, name) {
  const pattern = new RegExp(`\\n?# >>> ${escapeRegExp(name)}[\\s\\S]*?# <<< ${escapeRegExp(name)}\\n?`);
  return String(text || "").replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}

function uninstallMarkedConfig(name, path, dryRun) {
  const before = readText(path, "");
  const after = removeMarkedBlock(before, name);
  if (!dryRun) writeTextAtomic(path, after);
  return { path, before, after, changed: before !== after };
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
