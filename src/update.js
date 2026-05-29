import { join } from "node:path";
import { readJson, repoRoot, run } from "./util.js";

export const GITHUB_REPO = "Taylo0or/cxstatusline";
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_INSTALL_SPEC = `github:${GITHUB_REPO}`;

const PACKAGE = readJson(join(repoRoot, "package.json"), {});

export function currentVersion() {
  return String(PACKAGE.version || "0.0.0");
}

export function normalizeTag(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("v") ? text : `v${text}`;
}

export function versionFromTag(value) {
  return String(value || "").trim().replace(/^v/, "");
}

export function compareVersions(a, b) {
  const left = versionFromTag(a).split(/[.-]/).map(versionPart);
  const right = versionFromTag(b).split(/[.-]/).map(versionPart);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (typeof l === "number" && typeof r === "number" && l !== r) return l > r ? 1 : -1;
    const textCompare = String(l).localeCompare(String(r));
    if (textCompare !== 0) return textCompare > 0 ? 1 : -1;
  }
  return 0;
}

export function latestTagFromLsRemote(output) {
  const tags = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.match(/refs\/tags\/(v?\d+(?:\.\d+){1,3}(?:[-.][A-Za-z0-9]+)*)$/)?.[1])
    .filter(Boolean);
  tags.sort(compareVersions);
  return tags.at(-1) || "";
}

export function fetchLatestTag(options = {}) {
  const repoUrl = options.repoUrl || `${GITHUB_REPO_URL}.git`;
  const result = run("git", ["ls-remote", "--tags", "--refs", repoUrl], { timeout: options.timeout || 10000 });
  if (!result.ok) {
    throw new Error(result.stderr.trim() || result.error?.message || "Could not query GitHub tags");
  }
  const tag = latestTagFromLsRemote(result.stdout);
  if (!tag) throw new Error("No release tags found");
  return normalizeTag(tag);
}

export function buildPinnedInstallCommand(tag, manager = "npm") {
  const normalized = normalizeTag(tag);
  if (!normalized) throw new Error("A release tag is required");
  if (manager === "bun") return ["bun", "add", "-g", `${GITHUB_INSTALL_SPEC}#${normalized}`];
  if (manager !== "npm") throw new Error(`Unsupported package manager: ${manager}`);
  return ["npm", "install", "-g", `${GITHUB_INSTALL_SPEC}#${normalized}`];
}

export function formatCommand(command) {
  return command.map(shellWord).join(" ");
}

export function getUpdateStatus(options = {}) {
  const current = options.current || currentVersion();
  const latest = normalizeTag(options.latest || fetchLatestTag(options));
  const latestVersion = versionFromTag(latest);
  const updateAvailable = compareVersions(latestVersion, current) > 0;
  return {
    current,
    latest,
    latestVersion,
    updateAvailable,
    installCommand: formatCommand(buildPinnedInstallCommand(latest, options.manager || "npm"))
  };
}

export function runSelfUpdate(options = {}) {
  const tag = normalizeTag(options.tag || options.target || fetchLatestTag(options));
  const command = buildPinnedInstallCommand(tag, options.manager || "npm");
  if (options.dryRun) {
    return { tag, command, commandText: formatCommand(command), dryRun: true, ok: true };
  }
  const [bin, ...args] = command;
  const result = run(bin, args, { timeout: options.timeout || 120000 });
  return { tag, command, commandText: formatCommand(command), dryRun: false, ...result };
}

function versionPart(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function shellWord(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+#-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
