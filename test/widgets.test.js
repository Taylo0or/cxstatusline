import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { formatJjChangeSummary, formatPath, formatPullRequestInfo, formatResetTimer, inferContextWindow, parseGithubPullRequest, parseGitlabMergeRequest, parseJjBookmarks, parseJjStat, renderWidget, resolveWidgetType } from "../src/widgets.js";
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

test("renders ccstatusline-style link metadata", () => {
  const context = {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {}
  };

  const output = renderWidget({ type: "link", metadata: { url: "https://example.com/docs", text: "Docs" } }, context);
  assert.match(output, /\x1b]8;;https:\/\/example.com\/docs/);
  assert.equal(stripAnsi(output), "Docs");

  const urlLabel = renderWidget({ type: "link", metadata: { url: "https://example.com/docs" } }, context);
  assert.equal(stripAnsi(urlLabel), "https://example.com/docs");

  assert.equal(renderWidget({ type: "link", metadata: { text: "Docs" } }, context), "Docs");
});

test("renders Git branch and remote widgets as repo links from metadata", () => {
  const context = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      branch: "feature/link mode",
      isFork: true,
      origin: {
        host: "github.example.com",
        owner: "acme",
        repo: "tool",
        ownerRepo: "acme/tool",
        httpsUrl: "https://github.example.com/acme/tool"
      },
      upstreamRemote: {
        host: "gitlab.com",
        owner: "upstream",
        repo: "tool",
        ownerRepo: "upstream/tool",
        httpsUrl: "https://gitlab.com/upstream/tool"
      }
    },
    codexConfig: {}
  };

  const branch = renderWidget({ type: "gitBranch", linkToRepo: true }, context);
  assert.match(branch, /\x1b]8;;https:\/\/github\.example\.com\/acme\/tool\/tree\/feature\/link%20mode/);
  assert.equal(stripAnsi(branch), "feature/link mode");

  const legacy = renderWidget({ type: "gitBranch", metadata: { linkToGitHub: "true" } }, context);
  assert.match(legacy, /\x1b]8;;https:\/\/github\.example\.com\/acme\/tool\/tree\/feature\/link%20mode/);

  const disabledLegacy = renderWidget({ type: "gitBranch", metadata: { linkToRepo: "false", linkToGitHub: "true" } }, context);
  assert.equal(disabledLegacy, "feature/link mode");

  const origin = renderWidget({ type: "gitOriginOwnerRepo", metadata: { linkToRepo: "true" } }, context);
  assert.match(origin, /\x1b]8;;https:\/\/github\.example\.com\/acme\/tool/);
  assert.equal(stripAnsi(origin), "acme/tool");

  const upstream = renderWidget({ type: "gitUpstreamRepo", linkToRepo: true }, context);
  assert.match(upstream, /\x1b]8;;https:\/\/gitlab\.com\/upstream\/tool/);
  assert.equal(stripAnsi(upstream), "tool");

  assert.equal(renderWidget({ type: "gitOriginOwnerRepo", ownerOnlyWhenFork: true }, context), "acme");
});

test("renders Git remote empty states and hideNoRemote metadata", () => {
  const context = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      origin: {},
      upstreamRemote: {}
    },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "gitOriginOwner" }, context), "no remote");
  assert.equal(renderWidget({ type: "gitOriginRepo", hideNoRemote: true }, context), "");
  assert.equal(renderWidget({ type: "gitUpstreamOwnerRepo" }, context), "no upstream");
  assert.equal(renderWidget({ type: "gitUpstreamOwnerRepo", metadata: { hideNoRemote: "true" } }, context), "");
});

test("renders Git no-repo empty states and hideNoGit metadata", () => {
  const context = {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "gitBranch" }, context), "no git");
  assert.equal(renderWidget({ type: "gitStatus" }, context), "(no git)");
  assert.equal(renderWidget({ type: "gitRootDir" }, context), "no git");
  assert.equal(renderWidget({ type: "gitOriginOwnerRepo" }, context), "(no git)");
  assert.equal(renderWidget({ type: "gitBranch", hideNoGit: true }, context), "");
  assert.equal(renderWidget({ type: "gitStatus", metadata: { hideNoGit: "true" } }, context), "");
});

test("renders Git fork status raw values and hideWhenNotFork metadata", () => {
  const base = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      isFork: false,
      upstreamRemote: { ownerRepo: "upstream/tool" }
    },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "gitIsFork" }, base), "isFork: false");
  assert.equal(renderWidget({ type: "gitIsFork", rawValue: true }, { ...base, git: { ...base.git, isFork: true } }), "true");
  assert.equal(renderWidget({ type: "gitIsFork", metadata: { hideWhenNotFork: "true" } }, base), "");
});

test("renders Git worktree values with upstream icon and no-git metadata", () => {
  const regular = {
    config: {},
    state: {},
    codexConfig: {},
    git: { isRepo: true, worktree: { linked: false, name: "repo" } }
  };
  const linked = {
    ...regular,
    git: { isRepo: true, worktree: { linked: true, name: "feature/wt" } }
  };
  const noGit = { ...regular, git: { isRepo: false } };

  assert.equal(renderWidget({ type: "gitWorktree" }, regular), "\u{16830} main");
  assert.equal(renderWidget({ type: "gitWorktree", rawValue: true }, regular), "main");
  assert.equal(renderWidget({ type: "gitWorktree" }, linked), "\u{16830} feature/wt");
  assert.equal(renderWidget({ type: "gitWorktree", label: "" }, linked), "feature/wt");
  assert.equal(renderWidget({ type: "gitWorktree" }, noGit), "\u{16830} no git");
  assert.equal(renderWidget({ type: "gitWorktree", metadata: { hideNoGit: "true" } }, noGit), "");
});

test("renders Jujutsu no-repo empty states and hideNoJj metadata", () => {
  const context = {
    config: {},
    state: {},
    git: { isRepo: false },
    cwd: "/tmp/cxstatusline-not-a-jj-repo",
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "jjWorkspace" }, context), "\u25C6 no jj");
  assert.equal(renderWidget({ type: "jjRevision" }, context), "\uF1FA no jj");
  assert.equal(renderWidget({ type: "jjDescription" }, context), "no jj");
  assert.equal(renderWidget({ type: "jjBookmarks" }, context), "\u{1F516} no jj");
  assert.equal(renderWidget({ type: "jjRootDir" }, context), "no jj");
  assert.equal(renderWidget({ type: "jjChanges" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjChangedFiles" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjStats" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjBookmarkCount" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjInsertions" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjDeletions" }, context), "(no jj)");
  assert.equal(renderWidget({ type: "jjWorkspace", hideNoJj: true }, context), "");
  assert.equal(renderWidget({ type: "jjChanges", metadata: { hideNoJj: "true" } }, context), "");
});

test("renders Git root dir IDE links from metadata", () => {
  const context = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      root: "/Users/example/my repo#1",
      rootName: "my repo#1"
    },
    codexConfig: {}
  };

  const vscode = renderWidget({ type: "gitRootDir", linkToIDE: "vscode" }, context);
  assert.match(vscode, /\x1b]8;;vscode:\/\/file\/Users\/example\/my%20repo%231/);
  assert.equal(stripAnsi(vscode), "my repo#1");

  const cursor = renderWidget({ type: "gitRootDir", metadata: { linkToCursor: "true" } }, context);
  assert.match(cursor, /\x1b]8;;cursor:\/\/file\/Users\/example\/my%20repo%231/);
  assert.equal(stripAnsi(cursor), "my repo#1");

  const windows = renderWidget({ type: "gitRootDir", linkToIDE: "cursor" }, {
    ...context,
    git: { isRepo: true, root: "C:/Work/my repo#1", rootName: "my repo#1" }
  });
  assert.match(windows, /\x1b]8;;cursor:\/\/file\/C:\/Work\/my%20repo%231/);
  assert.equal(stripAnsi(windows), "my repo#1");
});

test("formats paths with home abbreviation, segments, and fish mode", () => {
  assert.equal(formatPath("/Users/luke/AlphaPay/ca-parent", { segments: 2, home: false }), "/.../AlphaPay/ca-parent");
  assert.equal(formatPath("/Users/luke/AlphaPay/ca-parent", { fish: true, home: false }), "/U/l/A/ca-parent");
  assert.equal(formatPath(`${homedir()}/Documents/AlphaPay/ca-parent`, { metadata: { segments: "2", abbreviateHome: "true" } }), "~/.../AlphaPay/ca-parent");
  assert.equal(formatPath(`${homedir()}/Documents/AlphaPay/ca-parent`, { metadata: { fishStyle: "true" } }), "~/D/A/ca-parent");
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
  assert.equal(stripAnsi(formatPullRequestInfo(pr)), "PR #42 APPROVED Add feature");
  assert.equal(stripAnsi(formatPullRequestInfo(pr, { hideStatus: true })), "PR #42 Add feature");
  assert.equal(stripAnsi(formatPullRequestInfo(pr, { hideTitle: true })), "PR #42 APPROVED");
  assert.equal(stripAnsi(formatPullRequestInfo(pr, { rawValue: true })), "#42 APPROVED Add feature");
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
  assert.equal(stripAnsi(formatPullRequestInfo(mr)), "MR #7 OPEN Ship");
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

test("keeps command output when a fast command closes stdin early", () => {
  const output = renderWidget({ type: "command", command: "printf command-ok" }, {
    config: {},
    state: { transcript: "x".repeat(1_000_000) },
    git: { isRepo: false },
    codexConfig: {},
    cwd: process.cwd()
  });

  assert.equal(output, "command-ok");
});

test("passes render context JSON to custom command stdin", () => {
  const output = renderWidget({
    type: "command",
    command: "cat"
  }, {
    config: { theme: "mono" },
    state: { model: "gpt-5.5" },
    git: { isRepo: true, branch: "main" },
    codexConfig: {},
    cwd: process.cwd()
  });

  assert.equal(JSON.parse(output).state.model, "gpt-5.5");
});

test("renders custom commandPath compatibility alias", () => {
  const output = renderWidget({ type: "command", commandPath: "printf command-path-ok" }, {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {},
    cwd: process.cwd()
  });

  assert.equal(output, "command-path-ok");
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
        weeklyUsagePercent: 0.4,
        extraUsageUsed: 25,
        extraUsageRemaining: 75
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
  assert.equal(renderWidget({ type: "sessionUsage", metadata: { display: "progress-short", invert: "true" } }, context), "[████████████░░░░] 75.0%");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider" } }, context), "▓▓▓▓▓░░░░░ 50.0%");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider-only" } }, context), "▓▓▓▓▓░░░░░");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider-only", cursor: "true" } }, context), "▓▓▓▓▓│░░░░");
  assert.equal(renderWidget({ type: "contextPercentage", display: "slider-only", cursor: true }, context), "▓▓▓▓▓│░░░░");
  assert.equal(renderWidget({ type: "weeklyUsage" }, context), "40%");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, context), "75");
  assert.equal(renderWidget({ type: "extraUsageUtilization" }, context), "25%");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { display: "progress-short", invert: "true" } }, context), "[████████████░░░░] 75.0%");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { display: "slider-only", cursor: "true" } }, context), "▓▓▓│░░░░░░");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, { ...context, state: { usage: { extraUsageRemaining: 0 } } }), "0");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, { ...context, state: { usage: { extraUsageEnabled: false } } }), "n/a");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { hideIfDisabled: "true" } }, { ...context, state: { usage: { extraUsageEnabled: false } } }), "");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, context), "50%");
  assert.equal(renderWidget({ type: "claudeSessionId" }, context), "abcdef12");
  assert.equal(renderWidget({ type: "sessionName" }, context), "Sprint");
  assert.equal(renderWidget({ type: "outputStyle" }, context), "concise");
  assert.equal(renderWidget({ type: "vimMode", format: "letter" }, context), "N");
  assert.equal(renderWidget({ type: "voiceStatus" }, context), "voice on");
  assert.equal(renderWidget({ type: "remoteControlStatus" }, context), "remote off");
  assert.equal(renderWidget({ type: "vimMode", metadata: { format: "icon-letter", nerdFont: "true" } }, context), "\uE62B N");
  assert.equal(renderWidget({ type: "voiceStatus", format: "icon" }, context), "\u{1F3A4} \u25C9");
  assert.equal(renderWidget({ type: "remoteControlStatus", format: "label-mark" }, context), "remote \u2717");
  assert.equal(renderWidget({ type: "skills", mode: "list" }, context), "review-pr, commit");
  assert.equal(renderWidget({ type: "skills", metadata: { mode: "list", listLimit: "1" } }, context), "review-pr");
  assert.equal(renderWidget({ type: "skills", metadata: { mode: "count" } }, context), "2");
  assert.equal(renderWidget({ type: "skills" }, { ...context, state: { skills: {} } }), "none");
  assert.equal(renderWidget({ type: "skills", metadata: { mode: "count" } }, { ...context, state: { skills: {} } }), "0");
  assert.equal(renderWidget({ type: "skills", metadata: { hideWhenEmpty: "true" } }, { ...context, state: { skills: {} } }), "");
  assert.equal(renderWidget({ type: "skills", metadata: { mode: "list", hideWhenEmpty: "true" } }, { ...context, state: { skills: { uniqueSkills: [] } } }), "");
  assert.equal(renderWidget({ type: "claudeAccountEmail" }, context), "dev@example.com");
  assert.equal(renderWidget({ type: "compactions", format: "icon-space-number", nerdFont: true }, {
    ...context,
    state: { compactions: 2 }
  }), "\uF021 2");
  assert.equal(renderWidget({ type: "compactions", hideZero: true }, {
    ...context,
    state: { compactions: 0 }
  }), "");
});

test("resolves ccstatusline kebab-case widget names", () => {
  assert.equal(resolveWidgetType("git-branch"), "gitBranch");
  assert.equal(resolveWidgetType("current-working-dir"), "cwd");
  assert.equal(resolveWidgetType("tokens-total"), "tokens");
  assert.equal(resolveWidgetType("git-pr"), "gitPullRequest");
  assert.equal(resolveWidgetType("worktree-original-branch"), "gitWorktreeOriginalBranch");
  assert.equal(resolveWidgetType("weekly-sonnet-usage"), "weeklySonnetUsage");
  assert.equal(resolveWidgetType("flex-separator"), "spacer");
});

test("renders ccstatusline widget aliases", () => {
  const context = {
    config: {},
    state: {
      model: "gpt-5.5",
      usage: { totalTokens: 1234 },
      startedAt: new Date(Date.now() - 60_000).toISOString()
    },
    git: {
      isRepo: true,
      branch: "main",
      status: { clean: true },
      diff: { insertions: 0, deletions: 0 },
      stagedDiff: { insertions: 0, deletions: 0 }
    },
    cwd: "/tmp/project",
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "git-branch" }, context), "main");
  assert.equal(renderWidget({ type: "tokens-total" }, context), "1.2k");
  assert.equal(renderWidget({ type: "current-working-dir", segments: 1, home: false }, context), "/.../project");
  assert.equal(renderWidget({ type: "separator", text: "::" }, context), "::");
  assert.match(renderWidget({ type: "reset-timer" }, context), /\d+[hms]/);
});

test("formats reset timers as duration, timestamp, iso, both, and progress bar", () => {
  const progress = {
    remaining: 90_000,
    ratio: 0.5,
    resetAt: new Date("2026-01-01T12:30:00.000Z")
  };

  assert.equal(formatResetTimer(progress), "1m 30s");
  assert.equal(formatResetTimer(progress, { format: "iso" }), "2026-01-01T12:30:00.000Z");
  assert.match(formatResetTimer(progress, { format: "timestamp", timeZone: "UTC", hour12: false, locale: "en-US" }), /12:30/);
  assert.match(formatResetTimer(progress, { metadata: { absolute: "true", timezone: "UTC" }, hour12: false, locale: "en-US" }), /12:30/);
  assert.match(formatResetTimer(progress, { format: "both", timeZone: "UTC", hour12: false, locale: "en-US" }), /^1m 30s \(.*12:30.*\)$/);
  assert.equal(formatResetTimer(progress, { format: "bar", width: 4 }), "[##--] 50%");
  assert.equal(formatResetTimer(progress, { metadata: { display: "slider" } }), "▓▓▓▓▓░░░░░ 50.0%");
  assert.equal(formatResetTimer(progress, { metadata: { display: "progress-short", invert: "true" } }), "[████████░░░░░░░░] 50.0%");
});

test("parses Jujutsu diff stats", () => {
  assert.deepEqual(parseJjStat("2 files changed, 12 insertions(+), 3 deletions(-)"), {
    files: 2,
    insertions: 12,
    deletions: 3
  });
  assert.deepEqual(parseJjStat(" file.txt | 8 +++++---\n1 file changed, 5 insertions(+), 3 deletions(-)"), {
    files: 1,
    insertions: 5,
    deletions: 3
  });
});

test("parses Jujutsu bookmarks and formats change summaries", () => {
  assert.deepEqual(parseJjBookmarks("main feature-branch\nrelease"), ["main", "feature-branch", "release"]);
  assert.deepEqual(parseJjBookmarks(""), []);
  assert.equal(formatJjChangeSummary({ insertions: 12, deletions: 3 }), "(+12,-3)");
  assert.equal(formatJjChangeSummary({}), "(+0,-0)");
});
