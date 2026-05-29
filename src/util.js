import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function homePath(...parts) {
  return join(os.homedir(), ...parts);
}

export function codexHome() {
  return process.env.CODEX_HOME || homePath(".codex");
}

export function cacheDir() {
  return process.env.CXSTATUSLINE_CACHE_DIR || homePath(".cache", "cxstatusline");
}

export function configDir() {
  return process.env.CXSTATUSLINE_CONFIG_DIR || homePath(".config", "cxstatusline");
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(path, value) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readText(path, fallback = "") {
  if (!existsSync(path)) return fallback;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

export function writeTextAtomic(path, value) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, value);
  renameSync(tmp, path);
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 1500,
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) }
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error || null,
      status: result.status
    };
  }

  return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "", status: 0 };
}

export function stripAnsi(value) {
  return String(value)
    .replace(/\x1B]8;;.*?\x1B\\/g, "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function visibleLength(value) {
  return [...stripAnsi(value)].length;
}

export function truncateMiddle(value, width) {
  const text = String(value);
  if (width <= 0 || visibleLength(text) <= width) return text;
  if (width <= 1) return ".";
  if (width <= 3) return ".".repeat(width);
  const clean = stripAnsi(text);
  const left = Math.ceil((width - 3) / 2);
  const right = Math.floor((width - 3) / 2);
  return `${clean.slice(0, left)}...${clean.slice(clean.length - right)}`;
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function parseFlags(args) {
  const flags = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      flags[key] = rest.join("=");
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      i += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }

  return { flags, positionals };
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function numberFormat(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(number);
}

export function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

export function nowIso() {
  return new Date().toISOString();
}
