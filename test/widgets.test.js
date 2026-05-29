import test from "node:test";
import assert from "node:assert/strict";
import { formatPath, inferContextWindow, parseGithubPullRequest, parseGitlabMergeRequest, parseJjStat, renderWidget } from "../src/widgets.js";
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

test("renders custom command output", () => {
  const output = renderWidget({ type: "command", command: "printf command-ok" }, {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {},
    cwd: process.cwd()
  });

  assert.equal(output, "command-ok");
});

test("renders parity aliases for speed, usage, session, and optional metadata", () => {
  const context = {
    config: {},
    state: {
      sessionId: "abcdef123456",
      sessionName: "Sprint",
      outputStyle: "concise",
      vimMode: "NORMAL",
      voiceStatus: true,
      remoteControlStatus: false,
      accountEmail: "dev@example.com",
      skills: {
        lastSkill: "review-pr",
        totalInvocations: 2,
        uniqueSkills: ["review-pr", "commit"]
      },
      usage: {
        contextUsed: 50,
        contextWindow: 100,
        usageLimitUsed: 25,
        usageLimitRemaining: 75,
        weeklyUsagePercent: 0.4
      },
      samples: [
        { at: "2026-01-01T00:00:00.000Z", totalTokens: 100, inputTokens: 80, outputTokens: 20 },
        { at: "2026-01-01T00:01:00.000Z", totalTokens: 220, inputTokens: 160, outputTokens: 60 }
      ],
      startedAt: new Date(Date.now() - 60_000).toISOString()
    },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "totalSpeed", windowSeconds: 0 }, context), "120/min");
  assert.equal(renderWidget({ type: "sessionUsage" }, context), "25%");
  assert.equal(renderWidget({ type: "weeklyUsage" }, context), "40%");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, context), "50%");
  assert.equal(renderWidget({ type: "claudeSessionId" }, context), "abcdef12");
  assert.equal(renderWidget({ type: "sessionName" }, context), "Sprint");
  assert.equal(renderWidget({ type: "outputStyle" }, context), "concise");
  assert.equal(renderWidget({ type: "vimMode", format: "letter" }, context), "N");
  assert.equal(renderWidget({ type: "voiceStatus" }, context), "voice on");
  assert.equal(renderWidget({ type: "remoteControlStatus" }, context), "remote off");
  assert.equal(renderWidget({ type: "skills", mode: "list" }, context), "review-pr, commit");
  assert.equal(renderWidget({ type: "claudeAccountEmail" }, context), "dev@example.com");
});

test("parses Jujutsu diff stats", () => {
  assert.deepEqual(parseJjStat("2 files changed, 12 insertions(+), 3 deletions(-)"), {
    files: 2,
    insertions: 12,
    deletions: 3
  });
});
