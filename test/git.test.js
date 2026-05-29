import test from "node:test";
import assert from "node:assert/strict";
import { parsePorcelainStatus, parseShortStat, parseRemote } from "../src/git.js";

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
});
