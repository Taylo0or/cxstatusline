import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPinnedInstallCommand,
  compareVersions,
  formatCommand,
  getUpdateStatus,
  latestTagFromLsRemote,
  normalizeTag,
  runSelfUpdate
} from "../src/update.js";

test("normalizes tags and compares semantic versions", () => {
  assert.equal(normalizeTag("0.2.24"), "v0.2.24");
  assert.equal(normalizeTag("v0.2.24"), "v0.2.24");
  assert.equal(compareVersions("0.2.24", "0.2.23"), 1);
  assert.equal(compareVersions("v0.2.23", "0.2.23"), 0);
  assert.equal(compareVersions("0.2.22", "0.2.23"), -1);
});

test("extracts the newest release tag from ls-remote output", () => {
  const output = [
    "abc\trefs/tags/v0.2.9",
    "def\trefs/tags/v0.2.24",
    "ghi\trefs/tags/v0.2.10"
  ].join("\n");
  assert.equal(latestTagFromLsRemote(output), "v0.2.24");
});

test("builds pinned GitHub install commands", () => {
  assert.deepEqual(buildPinnedInstallCommand("v0.2.24"), [
    "npm",
    "install",
    "-g",
    "github:Taylo0or/cxstatusline#v0.2.24"
  ]);
  assert.equal(formatCommand(buildPinnedInstallCommand("0.2.24")), "npm install -g github:Taylo0or/cxstatusline#v0.2.24");
});

test("reports update availability from supplied versions", () => {
  const status = getUpdateStatus({ current: "0.2.23", latest: "v0.2.24" });
  assert.equal(status.updateAvailable, true);
  assert.equal(status.installCommand, "npm install -g github:Taylo0or/cxstatusline#v0.2.24");

  assert.equal(getUpdateStatus({ current: "0.2.24", latest: "v0.2.24" }).updateAvailable, false);
});

test("self-update dry run returns the pinned command without executing it", () => {
  const result = runSelfUpdate({ tag: "v0.2.24", dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.commandText, "npm install -g github:Taylo0or/cxstatusline#v0.2.24");
});
