import { basename } from "node:path";
import { run } from "./util.js";

export function getGitInfo(cwd = process.cwd()) {
  const rootResult = git(["rev-parse", "--show-toplevel"], cwd);
  if (!rootResult.ok) {
    return { isRepo: false, cwd };
  }

  const root = rootResult.stdout.trim();
  const branchResult = git(["branch", "--show-current"], root);
  const shaResult = git(["rev-parse", "--short", "HEAD"], root);
  const statusResult = git(["status", "--porcelain=v1", "--branch"], root);
  const diffShortResult = git(["diff", "--shortstat"], root);
  const stagedShortResult = git(["diff", "--cached", "--shortstat"], root);
  const originResult = git(["config", "--get", "remote.origin.url"], root);
  const upstreamResult = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);
  const gitDirResult = git(["rev-parse", "--git-dir"], root);
  const commonDirResult = git(["rev-parse", "--git-common-dir"], root);

  const status = parsePorcelainStatus(statusResult.stdout);
  const diff = parseShortStat(diffShortResult.stdout);
  const stagedDiff = parseShortStat(stagedShortResult.stdout);
  const origin = parseRemote(originResult.stdout.trim());
  const gitDir = gitDirResult.stdout.trim();
  const commonDir = commonDirResult.stdout.trim();

  return {
    isRepo: true,
    root,
    rootName: basename(root),
    branch: branchResult.stdout.trim() || "(detached)",
    sha: shaResult.stdout.trim(),
    origin,
    upstream: upstreamResult.ok ? upstreamResult.stdout.trim() : "",
    worktree: {
      linked: Boolean(gitDir && commonDir && gitDir !== commonDir && !gitDir.endsWith("/.git")),
      name: basename(root)
    },
    status,
    diff,
    stagedDiff
  };
}

function git(args, cwd) {
  return run("git", ["--no-optional-locks", ...args], { cwd, timeout: 1200 });
}

export function parsePorcelainStatus(output) {
  const result = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    ahead: 0,
    behind: 0,
    clean: true
  };

  for (const line of String(output || "").split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const ahead = line.match(/ahead (\d+)/);
      const behind = line.match(/behind (\d+)/);
      if (ahead) result.ahead = Number(ahead[1]);
      if (behind) result.behind = Number(behind[1]);
      continue;
    }

    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") {
      result.untracked += 1;
    } else {
      if (x && x !== " ") result.staged += 1;
      if (y && y !== " ") result.unstaged += 1;
      if (["U", "A", "D"].includes(x) && ["U", "A", "D"].includes(y)) result.conflicts += 1;
    }
  }

  result.clean = result.staged + result.unstaged + result.untracked + result.conflicts === 0;
  return result;
}

export function parseShortStat(output) {
  const text = String(output || "").trim();
  const files = text.match(/(\d+) files? changed/);
  const insertions = text.match(/(\d+) insertions?\(\+\)/);
  const deletions = text.match(/(\d+) deletions?\(-\)/);
  return {
    files: files ? Number(files[1]) : 0,
    insertions: insertions ? Number(insertions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0
  };
}

export function parseRemote(remote) {
  const text = String(remote || "").trim().replace(/\.git$/, "");
  if (!text) return {};
  const match = text.match(/(?:github\.com|gitlab\.com)[/:]([^/\s:]+)\/([^/\s]+)$/i)
    || text.match(/([^/\s:]+)\/([^/\s]+)$/);
  if (!match) return { url: text };
  const [, owner, repo] = match;
  const host = text.includes("gitlab.com") ? "gitlab.com" : text.includes("github.com") ? "github.com" : "";
  const httpsUrl = host ? `https://${host}/${owner}/${repo}` : "";
  return { url: text, host, owner, repo, ownerRepo: `${owner}/${repo}`, httpsUrl };
}
