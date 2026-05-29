import test from "node:test";
import assert from "node:assert/strict";
import { homedir, tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatJjChangeSummary, formatPath, formatPullRequestInfo, formatResetTimer, inferContextWindow, parseGithubPullRequest, parseGitlabMergeRequest, parseJjBookmarks, parseJjStat, renderWidget, resolveWidgetType } from "../src/widgets.js";
import { stripAnsi } from "../src/util.js";

test("infers context windows from model suffixes", () => {
  assert.equal(inferContextWindow("gpt-example 1M context"), 1000000);
  assert.equal(inferContextWindow("model-200k"), 200000);
  assert.equal(inferContextWindow("claude-sonnet[1M]"), 1000000);
  assert.equal(inferContextWindow("model (1,000k context)"), 1000000);
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
  assert.equal(stripAnsi(output), "\u{1F517} repo");
  assert.equal(stripAnsi(renderWidget({ type: "link", text: "repo", href: "https://example.com", rawValue: true }, {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {}
  })), "repo");
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
  assert.equal(stripAnsi(output), "\u{1F517} Docs");

  const urlLabel = renderWidget({ type: "link", metadata: { url: "https://example.com/docs" } }, context);
  assert.equal(stripAnsi(urlLabel), "\u{1F517} https://example.com/docs");
  assert.equal(stripAnsi(renderWidget({ type: "link", metadata: { url: "https://example.com/docs", text: "Docs" }, rawValue: true }, context)), "Docs");

  assert.equal(renderWidget({ type: "link", metadata: { text: "Docs" } }, context), "\u{1F517} Docs");
  assert.equal(renderWidget({ type: "link" }, context), "\u{1F517} no url");
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
  assert.equal(stripAnsi(branch), "\u2387 feature/link mode");
  assert.equal(renderWidget({ type: "gitBranch", rawValue: true }, context), "feature/link mode");
  assert.equal(renderWidget({ type: "gitBranch", label: "" }, context), "feature/link mode");

  const legacy = renderWidget({ type: "gitBranch", metadata: { linkToGitHub: "true" } }, context);
  assert.match(legacy, /\x1b]8;;https:\/\/github\.example\.com\/acme\/tool\/tree\/feature\/link%20mode/);
  assert.equal(stripAnsi(legacy), "\u2387 feature/link mode");

  const disabledLegacy = renderWidget({ type: "gitBranch", metadata: { linkToRepo: "false", linkToGitHub: "true" } }, context);
  assert.equal(disabledLegacy, "\u2387 feature/link mode");

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

  assert.equal(renderWidget({ type: "gitBranch" }, context), "\u2387 no git");
  assert.equal(renderWidget({ type: "gitStatus" }, context), "(no git)");
  assert.equal(renderWidget({ type: "gitRootDir" }, context), "no git");
  assert.equal(renderWidget({ type: "gitOriginOwnerRepo" }, context), "(no git)");
  assert.equal(renderWidget({ type: "gitBranch", hideNoGit: true }, context), "");
  assert.equal(renderWidget({ type: "gitStatus", metadata: { hideNoGit: "true" } }, context), "");
});

test("renders upstream-style Git status indicators and file counts", () => {
  const context = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      upstream: "origin/main",
      status: {
        staged: 3,
        unstaged: 2,
        untracked: 1,
        conflicts: 2,
        ahead: 4,
        behind: 5,
        clean: false
      }
    },
    codexConfig: {}
  };
  const cleanContext = {
    ...context,
    git: {
      ...context.git,
      status: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, clean: true }
    }
  };

  assert.equal(renderWidget({ type: "gitStatus" }, context), "!+*?");
  assert.equal(renderWidget({ type: "gitStatus" }, cleanContext), "");
  assert.equal(renderWidget({ type: "gitCleanStatus" }, context), "\u2717");
  assert.equal(renderWidget({ type: "gitCleanStatus", rawValue: true }, context), "dirty");
  assert.equal(renderWidget({ type: "gitCleanStatus" }, cleanContext), "\u2713");
  assert.equal(renderWidget({ type: "gitCleanStatus", rawValue: true }, cleanContext), "clean");
  assert.equal(renderWidget({ type: "gitStaged" }, context), "+");
  assert.equal(renderWidget({ type: "gitStaged", character: "S" }, context), "S");
  assert.equal(renderWidget({ type: "gitStaged", rawValue: true }, context), "true");
  assert.equal(renderWidget({ type: "gitUnstaged" }, context), "*");
  assert.equal(renderWidget({ type: "gitUntracked" }, context), "?");
  assert.equal(renderWidget({ type: "gitStagedFiles" }, context), "S:3");
  assert.equal(renderWidget({ type: "gitStagedFiles", rawValue: true }, context), "3");
  assert.equal(renderWidget({ type: "gitUnstagedFiles" }, context), "M:2");
  assert.equal(renderWidget({ type: "gitUntrackedFiles" }, context), "?:1");
  assert.equal(renderWidget({ type: "gitConflicts" }, context), "\u26A0 2");
  assert.equal(renderWidget({ type: "gitConflicts", rawValue: true }, context), "2");
  assert.equal(renderWidget({ type: "gitAheadBehind" }, context), "\u21914\u21935");
  assert.equal(renderWidget({ type: "gitAheadBehind", rawValue: true }, context), "4,5");
  assert.equal(renderWidget({ type: "gitAheadBehind" }, { ...context, git: { ...context.git, upstream: "", status: { ...context.git.status, ahead: 0, behind: 0 } } }), "(no upstream)");
  assert.equal(renderWidget({ type: "gitAheadBehind", hideNoGit: true }, { ...context, git: { ...context.git, upstream: "", status: { ...context.git.status, ahead: 0, behind: 0 } } }), "");
});

test("renders upstream-style Git change count widgets", () => {
  const context = {
    config: {},
    state: {},
    git: {
      isRepo: true,
      diff: { insertions: 7, deletions: 2 },
      stagedDiff: { insertions: 5, deletions: 3 }
    },
    codexConfig: {}
  };
  const zeroContext = {
    ...context,
    git: {
      ...context.git,
      diff: { insertions: 0, deletions: 0 },
      stagedDiff: { insertions: 0, deletions: 0 }
    }
  };

  assert.equal(renderWidget({ type: "gitChanges" }, context), "(+12,-5)");
  assert.equal(renderWidget({ type: "gitInsertions" }, context), "+12");
  assert.equal(renderWidget({ type: "gitDeletions" }, context), "-5");
  assert.equal(renderWidget({ type: "gitChanges" }, zeroContext), "(+0,-0)");
  assert.equal(renderWidget({ type: "gitInsertions" }, zeroContext), "+0");
  assert.equal(renderWidget({ type: "gitDeletions" }, zeroContext), "-0");
  assert.equal(renderWidget({ type: "gitChanges" }, { ...context, git: { isRepo: false } }), "(no git)");
  assert.equal(renderWidget({ type: "gitChanges", hideNoGit: true }, { ...context, git: { isRepo: false } }), "");
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
  assert.equal(renderWidget({ type: "gitWorktreeMode" }, { ...noGit, state: { worktree: { name: "status-wt" } } }), "\u2387");
  assert.equal(renderWidget({ type: "gitWorktreeMode", rawValue: true }, { ...noGit, state: { worktree: { name: "status-wt" } } }), "true");
  assert.equal(renderWidget({ type: "gitWorktreeName" }, { ...noGit, state: { worktree: { name: "status-wt" } } }), "status-wt");
  assert.equal(renderWidget({ type: "gitWorktreeBranch" }, { ...noGit, state: { worktree: { branch: "feature" } } }), "feature");
  assert.equal(renderWidget({ type: "gitWorktreeOriginalBranch" }, { ...noGit, state: { worktree: { originalBranch: "main" } } }), "main");
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

test("renders upstream-style Context Bar display metadata", () => {
  const context = {
    config: {},
    state: { usage: { contextUsed: 30_000, contextWindow: 200_000 } },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "contextBar" }, context), "Context: [\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591] 30k/200k (15%)");
  assert.equal(renderWidget({ type: "contextBar", metadata: { display: "progress-short" }, style: "ascii", width: 10 }, context), "Context: [##--------] 30k/200k (15%)");
  assert.equal(renderWidget({ type: "contextBar", metadata: { display: "progress" }, label: "", style: "ascii", width: 10 }, context), "[##--------] 30k/200k (15%)");
  assert.equal(renderWidget({ type: "contextBar", metadata: { display: "slider" } }, context), "Context: \u2593\u2593\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 30k/200k (15%)");
  assert.equal(renderWidget({ type: "contextBar", metadata: { display: "slider-only" } }, context), "Context: \u2593\u2593\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591");
  assert.equal(renderWidget({ type: "contextBar", rawValue: true, style: "ascii", width: 10 }, context), "[##--------] 30k/200k (15%)");
});

test("renders raw and labeled core environment widgets", () => {
  const context = {
    config: {},
    state: {
      usage: { totalDurationMs: 2 * 60 * 60 * 1000 + 15 * 60 * 1000 },
      version: "1.2.3"
    },
    git: { isRepo: false },
    codexConfig: {}
  };
  const previousWidth = process.env.CXSTATUSLINE_WIDTH;
  process.env.CXSTATUSLINE_WIDTH = "132";

  try {
    assert.equal(renderWidget({ type: "sessionClock" }, context), "Session: 2hr 15m");
    assert.equal(renderWidget({ type: "sessionClock", rawValue: true }, context), "2hr 15m");
    assert.equal(renderWidget({ type: "version" }, context), "v1.2.3");
    assert.equal(renderWidget({ type: "version", rawValue: true }, context), "1.2.3");
    assert.equal(renderWidget({ type: "terminalWidth" }, context), "Term: 132");
    assert.equal(renderWidget({ type: "terminalWidth", rawValue: true }, context), "132");
  } finally {
    if (previousWidth === undefined) delete process.env.CXSTATUSLINE_WIDTH;
    else process.env.CXSTATUSLINE_WIDTH = previousWidth;
  }
});

test("renders upstream-style environment, worktree mode, and custom literal widgets", () => {
  const context = {
    config: {},
    state: {},
    git: { isRepo: true, worktree: { linked: true, name: "feature", branch: "wt-feature", original_branch: "main" } },
    codexConfig: {},
    terminalWidth: 101
  };

  assert.match(renderWidget({ type: "memory" }, context), /^Mem: .+\/.+$/);
  assert.doesNotMatch(renderWidget({ type: "memory", rawValue: true }, context), /^Mem: /);
  assert.equal(renderWidget({ type: "terminalWidth" }, context), "Term: 101");
  assert.equal(renderWidget({ type: "gitWorktreeMode" }, context), "\u2387");
  assert.equal(renderWidget({ type: "gitWorktreeMode", rawValue: true }, context), "true");
  assert.equal(renderWidget({ type: "gitWorktreeMode" }, { ...context, git: { isRepo: true, worktree: { linked: false } } }), "");
  assert.equal(renderWidget({ type: "gitWorktreeMode", rawValue: true }, { ...context, git: { isRepo: true, worktree: { linked: false } } }), "false");
  assert.equal(renderWidget({ type: "gitWorktreeOriginalBranch" }, context), "main");
  assert.equal(renderWidget({ type: "text", customText: "hello" }, context), "hello");
  assert.equal(renderWidget({ type: "symbol", customSymbol: "=>" }, context), "=>");
});

test("renders speed metrics, window metadata, reset labels, and extra usage API fields", () => {
  const resetAt = new Date(Date.now() + 270 * 60 * 1000).toISOString();
  const weeklyResetAt = new Date(Date.now() + 36.5 * 60 * 60 * 1000).toISOString();
  const context = {
    config: {},
    state: {
      speedMetrics: { totalDurationMs: 2000, totalTokens: 3000, inputTokens: 2000, outputTokens: 1000 },
      windowedSpeedMetrics: {
        75: { totalDurationMs: 4000, totalTokens: 400, inputTokens: 200, outputTokens: 200 }
      },
      usage: {
        sessionResetAt: resetAt,
        weeklyResetAt,
        extraUsageEnabled: true,
        extraUsageLimit: 400000,
        extraUsageUsed: 106
      }
    },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "totalSpeed" }, context), "Total: 1.5k t/s");
  assert.equal(renderWidget({ type: "outputSpeed", metadata: { windowSeconds: "75" } }, context), "Out: 50.0 t/s");
  assert.equal(renderWidget({ type: "totalSpeed" }, { ...context, state: { speedMetrics: { totalDurationMs: 0, totalTokens: 10 } } }), "Total: \u2014");
  assert.match(renderWidget({ type: "blockResetTimer" }, context), /^Reset: 4hr (29|30)m$/);
  assert.match(renderWidget({ type: "weeklyResetTimer" }, context), /^Weekly Reset: 1d 12hr (29|30)m$/);
  assert.equal(renderWidget({ type: "blockResetTimer" }, { ...context, state: { usage: { error: "timeout" } } }), "[Timeout]");
  assert.equal(renderWidget({ type: "weeklyResetTimer" }, { ...context, state: { usage: { error: "timeout" } } }), "[Timeout]");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, context), "Overage Left: $3,894.00");
  assert.equal(renderWidget({ type: "extraUsageRemaining", rawValue: true }, context), "$3,894.00");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, { ...context, state: { usage: { error: "timeout" } } }), "[Timeout]");
});

test("reads session name from transcript custom-title entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "cxstatusline-transcript-"));
  try {
    const transcript = join(dir, "session.jsonl");
    writeFileSync(transcript, [
      JSON.stringify({ type: "custom-title", customTitle: "Old Name" }),
      "{bad json",
      JSON.stringify({ type: "custom-title", customTitle: "New Name" })
    ].join("\n"));
    const context = {
      config: {},
      state: { transcriptPath: transcript },
      git: { isRepo: false },
      codexConfig: {}
    };

    assert.equal(renderWidget({ type: "sessionName" }, context), "Session: New Name");
    assert.equal(renderWidget({ type: "sessionName", rawValue: true }, context), "New Name");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("renders upstream-style Git PR empty states", () => {
  const context = {
    config: {},
    state: {},
    git: { isRepo: false },
    codexConfig: {},
    cwd: process.cwd()
  };

  assert.equal(renderWidget({ type: "gitPullRequest" }, context), "(no PR)");
  assert.equal(renderWidget({ type: "gitPullRequest", hideNoGit: true }, context), "");
  assert.equal(renderWidget({ type: "gitPullRequest" }, {
    ...context,
    git: { isRepo: false, origin: { host: "gitlab.com" } }
  }), "(no MR)");
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

  assert.equal(renderWidget({ type: "totalSpeed", windowSeconds: 0 }, context), "Total: 2.0 t/s");
  assert.equal(renderWidget({ type: "totalSpeed", windowSeconds: 0, rawValue: true }, context), "2.0 t/s");
  assert.equal(renderWidget({ type: "inputSpeed", windowSeconds: 0 }, context), "In: 1.3 t/s");
  assert.equal(renderWidget({ type: "outputSpeed", windowSeconds: 0 }, context), "Out: 0.7 t/s");
  assert.equal(renderWidget({ type: "sessionUsage" }, context), "Session: 25.0%");
  assert.equal(renderWidget({ type: "sessionUsage", rawValue: true }, context), "25.0%");
  assert.equal(renderWidget({ type: "sessionUsage", metadata: { display: "progress-short", invert: "true" } }, context), "Session: [████████████░░░░] 75.0%");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider" } }, context), "Ctx Used: ▓▓▓▓▓░░░░░ 50.0%");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider-only" } }, context), "Ctx Used: ▓▓▓▓▓░░░░░");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { display: "slider-only", cursor: "true" } }, context), "Ctx Used: ▓▓▓▓▓│░░░░");
  assert.equal(renderWidget({ type: "contextPercentage", display: "slider-only", cursor: true }, context), "Ctx Used: ▓▓▓▓▓│░░░░");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { inverse: "true" } }, context), "Ctx Left: 50.0%");
  assert.equal(renderWidget({ type: "weeklyUsage" }, context), "Weekly: 40.0%");
  assert.equal(renderWidget({ type: "weeklyUsage", rawValue: true }, context), "40.0%");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, context), "Overage Left: $75.00");
  assert.equal(renderWidget({ type: "extraUsageRemaining", rawValue: true }, context), "$75.00");
  assert.equal(renderWidget({ type: "extraUsageUtilization" }, context), "Overage: 25.0%");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { display: "progress-short", invert: "true" } }, context), "Overage: [████████████░░░░] 75.0%");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { display: "slider-only", cursor: "true" } }, context), "Overage: ▓▓▓│░░░░░░");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, { ...context, state: { usage: { extraUsageRemaining: 0 } } }), "Overage Left: $0.00");
  assert.equal(renderWidget({ type: "extraUsageRemaining" }, { ...context, state: { usage: { extraUsageEnabled: false } } }), "Overage Left: n/a");
  assert.equal(renderWidget({ type: "extraUsageUtilization", metadata: { hideIfDisabled: "true" } }, { ...context, state: { usage: { extraUsageEnabled: false } } }), "");
  const blockContext = { ...context, state: { startedAt: new Date(Date.now() - 13_500_000).toISOString() } };
  assert.equal(renderWidget({ type: "blockTimer" }, blockContext), "Block: 3hr 45m");
  assert.equal(renderWidget({ type: "blockTimer", rawValue: true }, blockContext), "3hr 45m");
  assert.equal(renderWidget({ type: "blockTimer", metadata: { compact: "true" } }, blockContext), "Block: 3h45m");
  assert.equal(renderWidget({ type: "blockTimer", metadata: { display: "progress-short", invert: "true" } }, blockContext), "Block [████░░░░░░░░░░░░] 25.0%");
  assert.equal(renderWidget({ type: "blockTimer", metadata: { display: "slider-only" } }, blockContext), "Block ▓▓▓▓▓▓▓▓░░");
  assert.equal(renderWidget({ type: "blockTimer" }, { ...context, state: {} }), "Block: 0hr 0m");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, context), "Ctx(u) Used: 62.5%");
  assert.equal(renderWidget({ type: "contextPercentageUsable", rawValue: true }, context), "62.5%");
  assert.equal(renderWidget({ type: "weeklySonnetUsage" }, { ...context, state: { usage: { weeklySonnetUsagePercent: 12.34 } } }), "Weekly Sonnet: 12.3%");
  assert.equal(renderWidget({ type: "weeklyOpusUsage" }, { ...context, state: { usage: { weeklyOpusUsagePercent: 4.56 } } }), "Weekly Opus: 4.6%");
  assert.equal(renderWidget({ type: "claudeSessionId" }, context), "Session ID: abcdef123456");
  assert.equal(renderWidget({ type: "claudeSessionId", rawValue: true }, context), "abcdef123456");
  assert.equal(renderWidget({ type: "sessionName" }, context), "Session: Sprint");
  assert.equal(renderWidget({ type: "sessionName", rawValue: true }, context), "Sprint");
  assert.equal(renderWidget({ type: "outputStyle" }, context), "Style: concise");
  assert.equal(renderWidget({ type: "outputStyle", rawValue: true }, context), "concise");
  assert.equal(renderWidget({ type: "claudeAccountEmail" }, context), "Account: dev@example.com");
  assert.equal(renderWidget({ type: "claudeAccountEmail", rawValue: true }, context), "dev@example.com");
  assert.equal(renderWidget({ type: "vimMode", format: "letter" }, context), "N");
  assert.equal(renderWidget({ type: "voiceStatus" }, context), "\u{1F3A4} \u25C9");
  assert.equal(renderWidget({ type: "voiceStatus", rawValue: true }, context), "on");
  assert.equal(renderWidget({ type: "voiceStatus", metadata: { format: "unknown" } }, context), "\u{1F3A4} \u25C9");
  assert.equal(renderWidget({ type: "voiceStatus", metadata: { nerdFont: "true" } }, context), "\uF130");
  assert.equal(renderWidget({ type: "voiceStatus", metadata: { format: "word" } }, context), "voice on");
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
  assert.equal(renderWidget({ type: "claudeAccountEmail" }, context), "Account: dev@example.com");
  assert.equal(renderWidget({ type: "compactions" }, { ...context, state: {} }), "\u21BB 0");
  assert.equal(renderWidget({ type: "compactions" }, { ...context, state: { compactions: 0 } }), "\u21BB 0");
  assert.equal(renderWidget({ type: "compactions" }, { ...context, state: { compactions: 2 } }), "\u21BB 2");
  assert.equal(renderWidget({ type: "compactions", metadata: { format: "icon-number" } }, { ...context, state: { compactions: 2 } }), "\u21BB 2");
  assert.equal(renderWidget({ type: "compactions", format: "text-and-number" }, {
    ...context,
    state: { compactions: 2 }
  }), "Compactions: 2");
  assert.equal(renderWidget({ type: "compactions", format: "number", nerdFont: true }, {
    ...context,
    state: { compactions: 2 }
  }), "2");
  assert.equal(renderWidget({ type: "compactions", format: "icon-space-number", nerdFont: true }, {
    ...context,
    state: { compactions: 2 }
  }), "\uF021 2");
  assert.equal(renderWidget({ type: "compactions", hideZero: true }, {
    ...context,
    state: { compactions: 0 }
  }), "");
});

test("renders upstream-style core labels and raw values", () => {
  const context = {
    config: {},
    state: {
      model: { id: "gpt-5.5", display_name: "GPT 5.5 (1M context)" },
      reasoningEffort: "xHigh",
      outputStyle: "concise",
      sessionName: "Sprint",
      sessionId: "abcdef123456",
      accountEmail: "dev@example.com",
      usage: { costUsd: 2.45 }
    },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "model" }, context), "Model: GPT 5.5");
  assert.equal(renderWidget({ type: "model", rawValue: true }, context), "GPT 5.5");
  assert.equal(renderWidget({ type: "model", label: "M" }, context), "M: GPT 5.5");
  assert.equal(renderWidget({ type: "reasoning" }, context), "Thinking: xhigh");
  assert.equal(renderWidget({ type: "reasoning", rawValue: true }, context), "xhigh");
  assert.equal(renderWidget({ type: "reasoning" }, { ...context, state: {}, codexConfig: {} }), "Thinking: default");
  assert.equal(renderWidget({ type: "thinking-effort" }, { ...context, state: { reasoningEffort: "Ultra" } }), "Thinking: ultra?");
  assert.equal(renderWidget({ type: "outputStyle" }, context), "Style: concise");
  assert.equal(renderWidget({ type: "sessionName" }, context), "Session: Sprint");
  assert.equal(renderWidget({ type: "cost" }, context), "Cost: $2.45");
  assert.equal(renderWidget({ type: "cost", rawValue: true }, context), "$2.45");
  assert.equal(renderWidget({ type: "claudeSessionId" }, context), "Session ID: abcdef123456");
  assert.equal(renderWidget({ type: "claudeAccountEmail" }, context), "Account: dev@example.com");
});

test("reads Claude account email from CLAUDE_CONFIG_DIR .claude.json", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cxstatusline-claude-"));
  const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const previousCodexEmail = process.env.CODEX_ACCOUNT_EMAIL;
  try {
    process.env.CLAUDE_CONFIG_DIR = tempDir;
    delete process.env.CODEX_ACCOUNT_EMAIL;
    writeFileSync(join(tempDir, ".claude.json"), JSON.stringify({
      oauthAccount: { emailAddress: "claude@example.com" }
    }));

    assert.equal(renderWidget({ type: "claudeAccountEmail" }, {
      config: {},
      state: {},
      git: { isRepo: false },
      codexConfig: {}
    }), "Account: claude@example.com");
  } finally {
    if (previousClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
    if (previousCodexEmail === undefined) delete process.env.CODEX_ACCOUNT_EMAIL;
    else process.env.CODEX_ACCOUNT_EMAIL = previousCodexEmail;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("reads Claude voice status from layered settings", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cxstatusline-voice-"));
  try {
    const projectClaudeDir = join(tempDir, ".claude");
    mkdirSync(projectClaudeDir);
    writeFileSync(join(projectClaudeDir, "settings.json"), JSON.stringify({
      voice: { enabled: true }
    }));

    assert.equal(renderWidget({ type: "voiceStatus", format: "word" }, {
      config: {},
      state: {},
      git: { isRepo: false },
      codexConfig: {},
      cwd: tempDir
    }), "voice on");
    assert.equal(renderWidget({ type: "voiceStatus", rawValue: true }, {
      config: {},
      state: {},
      git: { isRepo: false },
      codexConfig: {},
      cwd: tempDir
    }), "on");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renders upstream-style token and context labels", () => {
  const context = {
    config: {},
    state: {
      model: "GPT 5.5 (1M context)",
      usage: {
        totalTokens: 30600,
        inputTokens: 15200,
        outputTokens: 3400,
        cachedTokens: 12000,
        contextUsed: 42000,
        contextWindow: 1000000
      }
    },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "tokens" }, context), "Total: 30.6k");
  assert.equal(renderWidget({ type: "tokens", rawValue: true }, context), "30.6k");
  assert.equal(renderWidget({ type: "inputTokens" }, context), "In: 15.2k");
  assert.equal(renderWidget({ type: "outputTokens" }, context), "Out: 3.4k");
  assert.equal(renderWidget({ type: "cachedTokens" }, context), "Cached: 12.0k");
  assert.equal(renderWidget({ type: "contextLength" }, context), "Ctx: 42.0k");
  assert.equal(renderWidget({ type: "contextWindow" }, context), "Win: 1.0M");
  assert.equal(renderWidget({ type: "contextPercentage" }, context), "Ctx Used: 4.2%");
  assert.equal(renderWidget({ type: "contextPercentage", rawValue: true }, context), "4.2%");
  assert.equal(renderWidget({ type: "contextPercentage", metadata: { inverse: "true" } }, context), "Ctx Left: 95.8%");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, context), "Ctx(u) Used: 5.3%");
});

test("uses upstream default and inferred context windows when explicit size is missing", () => {
  const base = {
    config: {},
    state: {
      usage: { contextUsed: 42000 }
    },
    git: { isRepo: false },
    codexConfig: {}
  };

  assert.equal(renderWidget({ type: "contextWindow" }, base), "Win: 200.0k");
  assert.equal(renderWidget({ type: "contextPercentage" }, base), "Ctx Used: 21.0%");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, base), "Ctx(u) Used: 26.3%");
  assert.equal(renderWidget({ type: "contextPercentage" }, {
    ...base,
    state: { model: "claude-sonnet[1m]", usage: { contextUsed: 42000 } }
  }), "Ctx Used: 4.2%");
  assert.equal(renderWidget({ type: "contextPercentageUsable" }, {
    ...base,
    state: { model: "claude-sonnet[1m]", usage: { contextUsed: 42000 } }
  }), "Ctx(u) Used: 5.3%");
});

test("resolves ccstatusline kebab-case widget names", () => {
  assert.equal(resolveWidgetType("git-branch"), "gitBranch");
  assert.equal(resolveWidgetType("current-working-dir"), "cwd");
  assert.equal(resolveWidgetType("tokens-total"), "tokens");
  assert.equal(resolveWidgetType("git-pr"), "gitPullRequest");
  assert.equal(resolveWidgetType("worktree-original-branch"), "gitWorktreeOriginalBranch");
  assert.equal(resolveWidgetType("compaction-counter"), "compactions");
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

  assert.equal(renderWidget({ type: "git-branch" }, context), "\u2387 main");
  assert.equal(renderWidget({ type: "git-branch", rawValue: true }, context), "main");
  assert.equal(renderWidget({ type: "tokens-total" }, context), "Total: 1.2k");
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
