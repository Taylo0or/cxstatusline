import { existsSync } from "node:fs";
import readline from "node:readline/promises";
import { dirname } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { CODEX_NATIVE_ITEMS, DEFAULT_NATIVE_STATUS_LINE, PRESETS, THEMES } from "./constants.js";
import { applyPreset, defaultConfigPath, initConfig, loadConfig, saveConfig } from "./config.js";
import { codexConfigPath, installNativeStatusLine, readCodexConfig } from "./codexConfig.js";
import { getGitInfo } from "./git.js";
import { hooksPath, installHooks, uninstallHooks } from "./install.js";
import { renderStatusLine } from "./render.js";
import { listWidgets } from "./widgets.js";
import { loadState, readHookPayload, resetState, saveState, statePath, updateStateFromHook } from "./state.js";
import { cacheDir, codexHome, configDir, homePath, parseFlags, readText, run, writeTextAtomic } from "./util.js";

export async function runCli(args) {
  const [command = "render", ...rest] = args;
  if (command === "help" || command === "--help" || command === "-h") return help();

  if (command === "render") return renderCommand(rest);
  if (command === "hook") return hookCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "install") return installCommand(rest);
  if (command === "uninstall") return uninstallCommand(rest);
  if (command === "configure" || command === "config") return configureCommand(rest);
  if (command === "widgets") return widgetsCommand();
  if (command === "presets") return presetsCommand();
  if (command === "native-items") return nativeItemsCommand();
  if (command === "themes") return themesCommand();
  if (command === "doctor") return doctorCommand();
  if (command === "reset") return resetCommand();

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
  const git = getGitInfo(cwd);
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
  const interactive = !flags.yes && !flags.preset && !flags.theme && !flags.mode;

  if (interactive) {
    const rl = readline.createInterface({ input, output });
    try {
      const preset = await choose(rl, "Preset", Object.keys(PRESETS), "compact");
      const theme = await choose(rl, "Theme", Object.keys(THEMES), "powerline");
      const mode = await choose(rl, "Mode", ["powerline", "plain"], theme === "mono" ? "plain" : "powerline");
      flags.preset = preset;
      flags.theme = theme;
      flags.mode = mode;
      flags.installHooks = await yesNo(rl, "Install Codex hooks?", false);
      flags.installNative = await yesNo(rl, "Configure native Codex footer?", false);
    } finally {
      rl.close();
    }
  }

  if (flags.preset) config = applyPreset(config, flags.preset);
  if (flags.theme) config.theme = flags.theme;
  if (flags.mode) config.mode = flags.mode;
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
  if (target !== "hooks") throw new Error("Only hook uninstall is implemented. Native Codex status_line edits are left for manual review.");
  const result = uninstallHooks({ dryRun: Boolean(flags["dry-run"]) });
  console.log(`hooks: ${result.changed ? "updated" : "unchanged"} ${result.path}`);
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

function help() {
  console.log(`cxstatusline

Usage:
  cxstatusline render [--format plain|ansi|json] [--theme name] [--mode powerline|plain]
  cxstatusline hook
  cxstatusline configure
  cxstatusline init [--force]
  cxstatusline install [all|hooks|native|config|tmux|starship] [--dry-run] [--write]
  cxstatusline uninstall hooks
  cxstatusline widgets
  cxstatusline presets
  cxstatusline native-items
  cxstatusline themes
  cxstatusline doctor
  cxstatusline reset

Examples:
  cxstatusline render --format plain
  cxstatusline render --preset compact --format plain
  cxstatusline configure --preset compact --theme powerline --yes
  cxstatusline install hooks
  cxstatusline install tmux
  cxstatusline install tmux --write --preset compact
  cxstatusline install native --items model-with-reasoning,context-used,git-branch,run-state
  tmux set -g status-right '#(cxstatusline render --width 80)'
`);
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

function summarizeToml(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[tui]");
  if (start === -1) return text;
  const end = lines.findIndex((line, index) => index > start && /^\[[^\]]+]$/.test(line.trim()));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function tmuxSnippet(flags) {
  const width = flags.width || 90;
  const preset = flags.preset ? ` --preset ${flags.preset}` : "";
  return `set -g status-right '#(cxstatusline render --width ${width}${preset})'`;
}

function starshipSnippet(flags) {
  const preset = flags.preset ? ` --preset ${flags.preset}` : "";
  return `[custom.cxstatusline]
command = "cxstatusline render --format plain${preset}"
when = "true"
shell = ["sh", "-c"]
style = "bold blue"
format = "[$output]($style)"`;
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

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
