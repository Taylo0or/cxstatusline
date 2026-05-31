import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHookConfig } from "../src/install.js";
import { getHookTrustStatus } from "../src/island.js";

test("detects untrusted and trusted cxstatusline Codex hooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-island-"));
  try {
    const hookPath = join(dir, "hooks.json");
    const configPath = join(dir, "config.toml");
    writeFileSync(hookPath, JSON.stringify(createHookConfig("/usr/bin/node /tmp/cxstatusline.js hook"), null, 2));

    const untrusted = getHookTrustStatus({ hooksPath: hookPath, configPath });
    assert.equal(untrusted.trusted, false);
    assert.equal(untrusted.status, "untrusted");
    assert.equal(untrusted.total, 10);
    assert.equal(untrusted.missingRefs.length, 10);

    const trustSections = untrusted.missingRefs
      .map((ref) => `[hooks.state."${ref}"]\ntrusted_hash = "sha256:test"`)
      .join("\n\n");
    writeFileSync(configPath, `${trustSections}\n`);

    const trusted = getHookTrustStatus({ hooksPath: hookPath, configPath });
    assert.equal(trusted.trusted, true);
    assert.equal(trusted.status, "trusted");
    assert.equal(trusted.trustedCount, 10);
    assert.deepEqual(trusted.missingRefs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("island-status emits an authorization alert when hooks need review", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-island-status-"));
  try {
    writeFileSync(join(dir, "hooks.json"), JSON.stringify(createHookConfig("/usr/bin/node /tmp/cxstatusline.js hook"), null, 2));
    writeFileSync(join(dir, "config.toml"), "");

    const result = spawnSync(process.execPath, [
      "bin/cxstatusline.js",
      "island-status",
      "--preset",
      "compact",
      "--width",
      "80",
      "--cwd",
      dir
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_HOME: dir,
        CXSTATUSLINE_CACHE_DIR: dir,
        CXSTATUSLINE_CONFIG_DIR: dir,
        NO_COLOR: "1"
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hooks.trusted, false);
    assert.equal(payload.alerts[0].title, "Authorize hooks");
    assert.equal(payload.summary.agent, "Codex");
    assert.equal(payload.summary.runState, "Ready");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("island-status emits a permission alert from Codex hook state", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-island-permission-"));
  try {
    const hookPath = join(dir, "hooks.json");
    const configPath = join(dir, "config.toml");
    writeFileSync(hookPath, JSON.stringify(createHookConfig("/usr/bin/node /tmp/cxstatusline.js hook"), null, 2));
    const untrusted = getHookTrustStatus({ hooksPath: hookPath, configPath });
    writeFileSync(configPath, `${untrusted.missingRefs.map((ref) => `[hooks.state."${ref}"]\ntrusted_hash = "sha256:test"`).join("\n\n")}\n`);
    writeFileSync(join(dir, "state.json"), JSON.stringify({
      lastEvent: "PermissionRequest",
      sessionId: "abc",
      lastPayloadAt: "2026-05-29T00:00:00.000Z",
      runState: "Working"
    }));

    const result = spawnSync(process.execPath, [
      "bin/cxstatusline.js",
      "island-status",
      "--preset",
      "compact",
      "--width",
      "80",
      "--cwd",
      dir
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_HOME: dir,
        CXSTATUSLINE_CACHE_DIR: dir,
        CXSTATUSLINE_CONFIG_DIR: dir,
        NO_COLOR: "1"
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hooks.trusted, true);
    assert.equal(payload.alerts[0].title, "Authorization needed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
