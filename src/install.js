import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_EVENTS } from "./constants.js";
import { codexHome, readJson, shellQuote, writeJsonAtomic } from "./util.js";

export function hooksPath() {
  return join(codexHome(), "hooks.json");
}

export function currentHookCommand() {
  const binPath = join(dirname(dirname(fileURLToPath(import.meta.url))), "bin", "cxstatusline.js");
  return `${shellQuote(process.execPath)} ${shellQuote(binPath)} hook`;
}

export function createHookConfig(command = currentHookCommand()) {
  const hooks = {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command,
            timeout: 1
          }
        ]
      }
    ];
  }
  return { hooks };
}

export function installHooks(options = {}) {
  const path = options.path || hooksPath();
  const command = options.command || currentHookCommand();
  const existing = readJson(path, {});
  const merged = mergeHookConfig(existing, createHookConfig(command));
  if (!options.dryRun) writeJsonAtomic(path, merged);
  return { path, before: existing, after: merged, changed: JSON.stringify(existing) !== JSON.stringify(merged), existed: existsSync(path) };
}

export function uninstallHooks(options = {}) {
  const path = options.path || hooksPath();
  const existing = readJson(path, {});
  const next = removeCxHooks(existing);
  if (!options.dryRun) writeJsonAtomic(path, next);
  return { path, before: existing, after: next, changed: JSON.stringify(existing) !== JSON.stringify(next), existed: existsSync(path) };
}

export function mergeHookConfig(existing, addition) {
  const output = structuredClone(existing && typeof existing === "object" ? existing : {});
  output.hooks ||= {};

  for (const [event, groups] of Object.entries(addition.hooks || {})) {
    const current = Array.isArray(output.hooks[event]) ? output.hooks[event] : [];
    const cleaned = current.map((group) => ({
      ...group,
      hooks: (group.hooks || []).filter((hook) => !isCxHook(hook))
    })).filter((group) => (group.hooks || []).length > 0);
    output.hooks[event] = [...cleaned, ...groups];
  }

  return output;
}

export function removeCxHooks(existing) {
  const output = structuredClone(existing && typeof existing === "object" ? existing : {});
  if (!output.hooks) return output;
  for (const [event, groups] of Object.entries(output.hooks)) {
    output.hooks[event] = (groups || []).map((group) => ({
      ...group,
      hooks: (group.hooks || []).filter((hook) => !isCxHook(hook))
    })).filter((group) => (group.hooks || []).length > 0);
    if (output.hooks[event].length === 0) delete output.hooks[event];
  }
  return output;
}

export function isCxHook(hook) {
  return hook?.type === "command" && /\bcxstatusline(?:\.js)?\b/.test(String(hook.command || ""));
}
