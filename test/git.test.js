import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getGitInfo, parsePorcelainStatus, parseShortStat, parseRemote } from "../src/git.js";

test("parses porcelain branch and file status counts", () => {
  const status = parsePorcelainStatus(`## main...origin/main [ahead 2, behind 1]
M  staged.js
 M unstaged.js
?? new.js
UU conflict.js
`);

  assert.equal(status.ahead, 2);
  assert.equal(status.behind, 1);
  assert.equal(status.staged, 2);
  assert.equal(status.unstaged, 2);
  assert.equal(status.untracked, 1);
  assert.equal(status.conflicts, 1);
  assert.equal(status.clean, false);
});

test("parses git shortstat", () => {
  assert.deepEqual(parseShortStat(" 2 files changed, 10 insertions(+), 3 deletions(-)"), {
    files: 2,
    insertions: 10,
    deletions: 3
  });
});

test("parses common GitHub and GitLab remote URLs", () => {
  assert.deepEqual(parseRemote("git@github.com:owner/repo.git"), {
    url: "git@github.com:owner/repo",
    host: "github.com",
    owner: "owner",
    repo: "repo",
    ownerRepo: "owner/repo",
    httpsUrl: "https://github.com/owner/repo"
  });

  assert.equal(parseRemote("https://gitlab.com/acme/tool.git").ownerRepo, "acme/tool");
  assert.deepEqual(parseRemote("ssh://git@git.company.test/group/platform/tool.git"), {
    url: "ssh://git@git.company.test/group/platform/tool",
    host: "git.company.test",
    owner: "group/platform",
    repo: "tool",
    ownerRepo: "group/platform/tool",
    httpsUrl: "https://git.company.test/group/platform/tool"
  });
});

test("reports upstream remote and fork status", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-upstream-"));
  process.env.CXSTATUSLINE_CACHE_DIR = mkdtempSync(join(tmpdir(), "cxstatusline-cache-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:user/fork.git"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "remote.upstream.url", "git@github.com:upstream/repo.git"], { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# test\n");

  const info = getGitInfo(dir, { ttlMs: 0 });

  assert.equal(info.upstreamRemote.ownerRepo, "upstream/repo");
  assert.equal(info.isFork, true);
});

test("uses the tracking remote when no literal upstream remote exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-tracking-"));
  process.env.CXSTATUSLINE_CACHE_DIR = mkdtempSync(join(tmpdir(), "cxstatusline-cache-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:user/fork.git"], { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "branch.main.remote", "origin"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "branch.main.merge", "refs/heads/main"], { cwd: dir, stdio: "ignore" });

  const info = getGitInfo(dir, { ttlMs: 0 });

  assert.equal(info.upstream, "origin/main");
  assert.equal(info.upstreamRemote.ownerRepo, "user/fork");
  assert.equal(info.isFork, false);
});

test("caches git info within the configured TTL", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-git-"));
  const cache = mkdtempSync(join(tmpdir(), "cxstatusline-cache-"));
  process.env.CXSTATUSLINE_CACHE_DIR = cache;
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# test\n");

  const first = getGitInfo(dir, { ttlMs: 10000 });
  const second = getGitInfo(dir, { ttlMs: 10000 });

  assert.equal(first.isRepo, true);
  assert.equal(second.cached, true);
});
