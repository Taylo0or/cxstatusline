import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_NATIVE_STATUS_LINE } from "./constants.js";
import { codexHome, readText, writeTextAtomic } from "./util.js";

export function codexConfigPath() {
  return join(codexHome(), "config.toml");
}

export function readCodexConfig(path = codexConfigPath()) {
  const text = readText(path, "");
  return parseSimpleToml(text);
}

export function parseSimpleToml(text) {
  const result = {};
  let section = result;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = result;
      for (const part of sectionMatch[1].split(".")) {
        section[part] ||= {};
        section = section[part];
      }
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    section[match[1]] = parseTomlValue(match[2]);
  }
  return result;
}

function parseTomlValue(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) return trimmed.slice(1, -1).replace(/\\"/g, "\"");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return [...trimmed.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  }
  return trimmed;
}

export function upsertNativeStatusLine(text, items = DEFAULT_NATIVE_STATUS_LINE, useColors = true) {
  const block = [
    `status_line = [${items.map((item) => `"${item}"`).join(", ")}]`,
    `status_line_use_colors = ${useColors ? "true" : "false"}`
  ];

  const lines = String(text || "").split(/\r?\n/);
  let tuiStart = -1;
  let nextSection = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\[tui]$/.test(lines[index].trim())) {
      tuiStart = index;
      continue;
    }
    if (tuiStart !== -1 && index > tuiStart && /^\[[^\]]+]$/.test(lines[index].trim())) {
      nextSection = index;
      break;
    }
  }

  if (tuiStart === -1) {
    const prefix = text && !text.endsWith("\n") ? "\n\n" : text ? "\n" : "";
    return `${text}${prefix}[tui]\n${block.join("\n")}\n`;
  }

  const before = lines.slice(0, tuiStart + 1);
  const body = lines
    .slice(tuiStart + 1, nextSection)
    .filter((line) => !/^\s*status_line(_use_colors)?\s*=/.test(line));
  const after = lines.slice(nextSection);
  return [...before, ...body, ...block, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

export function installNativeStatusLine(options = {}) {
  const path = options.path || codexConfigPath();
  const before = readText(path, "");
  const items = options.items || DEFAULT_NATIVE_STATUS_LINE;
  const after = upsertNativeStatusLine(before, items, options.useColors !== false);
  if (!options.dryRun) writeTextAtomic(path, after);
  return { path, before, after, changed: before !== after, existed: existsSync(path) };
}
