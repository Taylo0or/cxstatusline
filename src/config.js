import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, THEMES } from "./constants.js";
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
  copyFileSync(templateConfigPath(), target);
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
