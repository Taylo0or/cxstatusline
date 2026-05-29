import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, PRESETS, THEMES } from "./constants.js";
import { configDir, ensureDir, readJson, repoRoot, writeJsonAtomic } from "./util.js";

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
