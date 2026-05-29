import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, PRESETS, THEMES } from "./constants.js";
import { configDir, ensureDir, homePath, readJson, repoRoot, writeJsonAtomic } from "./util.js";
import { resolveWidgetType } from "./widgets.js";

export function defaultConfigPath() {
  return join(configDir(), "config.json");
}

export function templateConfigPath() {
  return join(repoRoot, "templates", "config.json");
}

export function loadConfig(options = {}) {
  const path = options.config || defaultConfigPath();
  const loaded = readJson(path, null);
  const config = mergeConfig(DEFAULT_CONFIG, loaded || {});
  config.theme = THEMES[config.theme] ? config.theme : DEFAULT_CONFIG.theme;
  return config;
}

export function initConfig(options = {}) {
  const target = options.config || defaultConfigPath();
  ensureDir(configDir());
  if (existsSync(target) && !options.force) {
    return { path: target, created: false };
  }
  if (options.preset && PRESETS[options.preset]) {
    const config = applyPreset(DEFAULT_CONFIG, options.preset);
    writeJsonAtomic(target, config);
  } else {
    copyFileSync(templateConfigPath(), target);
  }
  return { path: target, created: true };
}

export function saveConfig(config, options = {}) {
  const target = options.config || defaultConfigPath();
  writeJsonAtomic(target, config);
  return target;
}

export function mergeConfig(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return structuredClone(base);
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = mergeConfig(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function applyPreset(config, presetName) {
  const preset = PRESETS[presetName];
  const output = structuredClone(config);
  if (!preset) return output;
  if (Array.isArray(preset)) {
    output.widgets = structuredClone(preset);
    delete output.lines;
  } else {
    Object.assign(output, structuredClone(preset));
  }
  return output;
}

export function defaultCcstatuslineConfigPath() {
  return homePath(".config", "ccstatusline", "settings.json");
}

export function importCcstatuslineConfig(options = {}) {
  const source = options.from || defaultCcstatuslineConfigPath();
  const settings = readJson(source, null);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`Could not read ccstatusline settings from ${source}`);
  }

  const base = loadConfig({ config: options.config });
  const converted = convertCcstatuslineSettings(settings, base);
  if (!options.dryRun) saveConfig(converted, { config: options.config });
  return {
    source,
    path: options.config || defaultConfigPath(),
    config: converted
  };
}

export function convertCcstatuslineSettings(settings, base = DEFAULT_CONFIG) {
  const output = structuredClone(base);
  if (typeof settings.minimalistMode === "boolean") output.minimal = settings.minimalistMode;
  const refreshInterval = normalizeRefreshIntervalSeconds(settings.refreshInterval ?? settings.statusLine?.refreshInterval);
  if (refreshInterval) output.refreshIntervalSeconds = refreshInterval;
  if (["full", "full-minus-40", "full-until-compact"].includes(settings.flexMode)) output.flexMode = settings.flexMode;
  if (settings.compactThreshold !== undefined) {
    const threshold = Number(settings.compactThreshold);
    if (Number.isFinite(threshold) && threshold > 0) output.compactThreshold = Math.min(99, Math.max(1, Math.round(threshold)));
  }
  if (typeof settings.defaultSeparator === "string") {
    output.defaultSeparator = settings.defaultSeparator;
    output.separator = settings.defaultSeparator;
  }
  if (typeof settings.defaultPadding === "string") output.defaultPadding = settings.defaultPadding;
  if (typeof settings.inheritSeparatorColors === "boolean") output.inheritSeparatorColors = settings.inheritSeparatorColors;
  if (typeof settings.globalBold === "boolean") output.globalBold = settings.globalBold;
  const overrideForegroundColor = normalizeColor(settings.overrideForegroundColor);
  const overrideBackgroundColor = normalizeColor(settings.overrideBackgroundColor);
  if (overrideForegroundColor) output.overrideForegroundColor = overrideForegroundColor;
  if (overrideBackgroundColor) output.overrideBackgroundColor = overrideBackgroundColor;
  if (settings.gitCacheTtlSeconds !== undefined) {
    output.gitCacheTtlMs = Math.max(0, Number(settings.gitCacheTtlSeconds) || 0) * 1000;
  }

  const powerline = settings.powerline && typeof settings.powerline === "object" ? settings.powerline : null;
  if (powerline) {
    output.mode = powerline.enabled ? "powerline" : "plain";
    output.powerline = {
      ...(output.powerline || {}),
      separator: Array.isArray(powerline.separators) && powerline.separators.length ? powerline.separators[0] : output.powerline?.separator,
      separators: Array.isArray(powerline.separators) ? powerline.separators : output.powerline?.separators,
      separatorInvertBackground: Array.isArray(powerline.separatorInvertBackground)
        ? powerline.separatorInvertBackground.map(Boolean)
        : output.powerline?.separatorInvertBackground,
      startCaps: Array.isArray(powerline.startCaps) ? powerline.startCaps : output.powerline?.startCaps,
      endCaps: Array.isArray(powerline.endCaps) ? powerline.endCaps : output.powerline?.endCaps,
      autoAlign: Boolean(powerline.autoAlign),
      continueThemeAcrossLines: Boolean(powerline.continueThemeAcrossLines)
    };
  }

  const lines = Array.isArray(settings.lines)
    ? settings.lines.map((line) => convertCcstatuslineLine(line, settings)).filter((line) => line.length > 0)
    : [];

  if (lines.length > 1) {
    output.lines = lines;
    delete output.widgets;
  } else if (lines.length === 1) {
    output.widgets = lines[0];
    delete output.lines;
  }

  return output;
}

export function normalizeRefreshIntervalSeconds(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text || ["0", "off", "none", "false", "remove", "disabled"].includes(text)) return null;
  const interval = Number(text);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  return Math.min(60, Math.max(1, Math.round(interval)));
}

function convertCcstatuslineLine(line, settings) {
  if (!Array.isArray(line)) return [];
  return line
    .map((widget) => convertCcstatuslineWidget(widget, settings))
    .filter(Boolean);
}

function convertCcstatuslineWidget(widget, settings) {
  if (typeof widget === "string") return { type: resolveWidgetType(widget) || widget };
  if (!widget || typeof widget !== "object" || Array.isArray(widget)) return null;

  const sourceType = widget.type || "text";
  const type = resolveWidgetType(sourceType) || sourceType;
  const output = { type };

  if (widget.rawValue || settings.minimalistMode) output.label = "";
  for (const key of [
    "text",
    "symbol",
    "command",
    "commandPath",
    "href",
    "url",
    "timeout",
    "width",
    "maxWidth",
    "preserveColors",
    "merge",
    "bold",
    "format",
    "mode",
    "nerdFont",
    "hideZero",
    "display",
    "invert",
    "cursor",
    "compact",
    "abbreviateHome",
    "fishStyle",
    "linkToRepo",
    "linkToGitHub",
    "hideNoGit",
    "hideNoJj",
    "hideNoRemote",
    "ownerOnlyWhenFork",
    "hideWhenNotFork",
    "hideIfDisabled",
    "hideWhenEmpty",
    "absolute",
    "timezone",
    "linkToIDE",
    "linkToCursor"
  ]) {
    if (key === "commandPath" && widget[key] !== undefined && output.command === undefined) output.command = widget[key];
    else if (key !== "commandPath" && widget[key] !== undefined) output[key] = widget[key];
  }

  if (type === "separator" && output.text === undefined) {
    output.text = widget.separator || widget.value || settings.defaultSeparator || "|";
  }

  const metadata = widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (type === "link" && ["url", "text"].includes(key) && output[key] === undefined) {
      output[key] = coerceMetadataValue(value);
      continue;
    }
    if ([
      "format",
      "mode",
      "nerdFont",
      "hideZero",
      "display",
      "style",
      "invert",
      "cursor",
      "compact",
      "segments",
      "abbreviateHome",
      "fish",
      "fishStyle",
      "home",
      "limit",
      "listLimit",
      "locale",
      "timeZone",
      "hour12",
      "twelveHour",
      "date",
      "includeDate",
      "linkToRepo",
      "linkToGitHub",
      "hideNoGit",
      "hideNoJj",
      "hideNoRemote",
      "ownerOnlyWhenFork",
      "hideWhenNotFork",
      "hideIfDisabled",
      "hideWhenEmpty",
      "absolute",
      "timezone",
      "linkToIDE",
      "linkToCursor"
    ].includes(key)) {
      output[key === "listLimit" ? "limit" : key] = coerceMetadataValue(value);
    }
  }

  const fg = normalizeColor(widget.fg || widget.color);
  const bg = normalizeColor(widget.bg || widget.background || widget.backgroundColor);
  if (fg) output.fg = fg;
  if (bg) output.bg = bg;
  return output;
}

function coerceMetadataValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return value;
}

function normalizeColor(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return text;
  if (/^hex:[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return `#${text.slice(4)}`;
  if (/^bg:/i.test(text)) return normalizeColor(text.slice(3));
  return NAMED_COLORS[text.toLowerCase()] || "";
}

const NAMED_COLORS = {
  black: "#000000",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#c026d3",
  cyan: "#0891b2",
  white: "#f8fafc",
  gray: "#64748b",
  grey: "#64748b",
  brightblack: "#475569",
  brightred: "#ef4444",
  brightgreen: "#22c55e",
  brightyellow: "#eab308",
  brightblue: "#3b82f6",
  brightmagenta: "#d946ef",
  brightcyan: "#06b6d4",
  brightwhite: "#ffffff"
};
