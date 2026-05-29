import test from "node:test";
import assert from "node:assert/strict";
import { formatPath, inferContextWindow, parseGithubPullRequest, parseGitlabMergeRequest, renderWidget } from "../src/widgets.js";
import { stripAnsi } from "../src/util.js";

test("infers context windows from model suffixes", () => {
  assert.equal(inferContextWindow("gpt-example 1M context"), 1000000);
  assert.equal(inferContextWindow("model-200k"), 200000);
  assert.equal(inferContextWindow("plain-model"), 0);
});

test("renders OSC8 links and strips them for visible text", () => {
  const output = renderWidget({ type: "link", text: "repo", href: "https://example.com" }, {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {}
  });

  assert.match(output, /\x1b]8;;https:\/\/example.com/);
  assert.equal(stripAnsi(output), "repo");
});

test("formats paths with home abbreviation, segments, and fish mode", () => {
  assert.equal(formatPath("/Users/luke/AlphaPay/ca-parent", { segments: 2, home: false }), "/.../AlphaPay/ca-parent");
  assert.equal(formatPath("/Users/luke/AlphaPay/ca-parent", { fish: true, home: false }), "/U/l/A/ca-parent");
});

test("parses rich GitHub pull request metadata", () => {
  const pr = parseGithubPullRequest({
    number: 42,
    title: "Add feature",
    url: "https://github.com/acme/tool/pull/42",
    state: "OPEN",
    isDraft: false,
    reviewDecision: "APPROVED",
    headRefName: "feature",
    baseRefName: "main",
    changedFiles: 3,
    additions: 20,
    deletions: 5,
    comments: { nodes: [{}, {}] },
    commits: [{}, {}, {}]
  });

  assert.equal(pr.label, "PR #42 Add feature");
  assert.equal(pr.reviewDecision, "APPROVED");
  assert.equal(pr.comments, 2);
  assert.equal(pr.commits, 3);
});

test("parses rich GitLab merge request metadata", () => {
  const mr = parseGitlabMergeRequest({
    iid: 7,
    title: "Ship",
    web_url: "https://gitlab.com/acme/tool/-/merge_requests/7",
    state: "opened",
    source_branch: "ship",
    target_branch: "main",
    changes_count: "4",
    additions: 12,
    deletions: 2
  });

  assert.equal(mr.label, "MR !7 Ship");
  assert.equal(mr.changedFiles, 4);
  assert.equal(mr.headRefName, "ship");
  assert.equal(mr.baseRefName, "main");
});
